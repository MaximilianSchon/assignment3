import {
    Prisma,
    Test_Session,
} from ".prisma/client";
import {
    Controller,
    Get,
    Inject,
    PathParams,
    Post,
    Req,
    Res,
    View
} from "@tsed/common";
import {Authenticate} from "@tsed/passport";
import path from "path";
import {AuthRoles} from "../decorators/AuthRoles";
import {UserService} from "../services/UserService";
import {Forbidden} from "@tsed/exceptions";
import got from 'got';
import parser from "fast-xml-parser";
import csv from "csvtojson";

@Controller("/")
export class IndexController {

    @Inject()
    private userService : UserService;

    @Post('/annotate')
    @AuthRoles('researcher', 'junior researcher', 'physician')
    annotate() {
        /**
         * The request should probably look something like this.
         * Annotation (text)
         * X (canvasX - Center)
         * Y (canvasY - Center)
         * Radius/Side (of the object)
         **/
        return {result: "Sucessfully annotated"}
    }

    @Get('/')
    @View('login.ejs')
    get() {
        return {user: false}
    }

    @Authenticate("facebook")
    @AuthRoles('patient')
    @Get("/patient")
    @View("patient.ejs")
    user(@Req()request : any) {

        const videos = [
            "https://www.youtube.com/embed/cRLB7WqX0fU",
            "https://www.youtube.com/embed/ckn9zybpYZ8",
            "https://www.youtube.com/embed/BNzIaABFAMc",
            "https://www.youtube.com/embed/Hu5KVfFnrh0",
            "https://www.youtube.com/embed/NAfQoviLFR8",
            "https://www.youtube.com/embed/KWVJBg6SCoY"

        ];

        return {
            user: JSON.parse(request.session.passport.user),
            videos: videos
        }
    }

    @Authenticate("twitter")
    @AuthRoles('physician')
    @Get("/physician")
    @View("physician.ejs")
    async physician(@Req()request : any) {
        const session = JSON.parse(request.session.passport.user)
        const {user, patients} = await this.getUserWithPatients(session.userID);
        return {user, patients}
    }

    @Authenticate("github")
    @AuthRoles('researcher', 'junior researcher')
    @Get("/researcher")
    @View("researcher.ejs")
    async researcher(@Req()request : any) {
        const session = JSON.parse(request.session.passport.user)
        const {user, patients} = await this.getUserWithPatients(session.userID);
        const feed = await this.fetchRSSFeed("https://www.news-medical.net/tag/feed/Parkinsons-Disease.aspx")
        return {user, patients, feed}
    }

    @Get("/data/:data")
    @AuthRoles('researcher', 'physician')
    @View("data-viz.ejs")
    async data(@PathParams("data")data : string, @Req()request : any, @Res()response : Res) {
        const session = JSON.parse(request.session.passport.user)
        const d = await this.getDataFromUserId(data, session.userID)
        console.log(d.data)
        const user = await this.userService
        .findUnique({
            where: {
                userID: session.userID
            }});

        return {user, ...d}
    }


    async getDataFromUserId(data: string, userId: number) {
        const {patients} = await this.getUserWithPatients(userId)
        const sessions = patients.reduce((acc : string[], p : UserWithTherapies[]) => [
            ...acc,
            ...p
            //@ts-ignore checks permissions
                .patient_therapies
                .reduce((acc : string[], th : TherapyWithTests) => [
                    ...acc,
                    ...th
                        .tests
                        .reduce((acc : string[], t : TestWithSessions) => [
                            ...acc,
                            ...t.test_sessions

                        ], [])
                ], [])
        ], [])
        const types =  sessions.reduce((acc : string[], ts : Test_Session) => ({
            ...acc,
            [`${ts.dataURL}.csv`]: ts.type
        }), {})
        const type = types[data];
        const files = sessions.reduce((acc : string[], ts : Test_Session) => [
            ...acc,
            `${ts.dataURL}.csv`
        ], [])
        if (!files.includes(data)) {
            throw new Forbidden("You do not have access to that file")
        }
        const csvPath = path.join(__dirname, `../data/${data}`);
        // https://stackoverflow.com/questions/67256503/csv-to-json-list-of-arrays
        const json = await csv()
            .fromFile(csvPath)
        return {data: json, type}
    }

    async fetchRSSFeed(feed : string) {
        const buffer = await got(feed, {
            responseType: "buffer",
            resolveBodyOnly: true,
            timeout: 5000,
            retry: 5
        });
        return parser.parse(buffer.toString(), {ignoreAttributes: false});
    }

    async getUserWithPatients(userID : number) {
        const user : any = await this
            .userService
            .findUnique({
                where: {
                    userID: userID
                },
                include: {
                    treater_therapies: {
                        include: {
                            patient: {
                                include: {
                                    patient_therapies: {
                                        include: {
                                            tests: {
                                                include: {
                                                    test_sessions: {
                                                        include: {
                                                            notes: {
                                                                include: {
                                                                    user_med: true
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            therapyList: {
                                                include: {
                                                    medicine: true
                                                }
                                            }
                                        }
                                    }

                                }
                            }
                        }
                    }
                }
            });

        const patients = user
            .treater_therapies
            .reduce((acc : UserWithTherapies[], therapy : TherapyWithPatient) => {
                const index = acc.findIndex(p => p.userID === therapy.user_IDpatient);
                if (index === -1) {
                    return [
                        ...acc,
                        therapy.patient
                    ];
                }
            }, [])
        return {user, patients}
    }
}

const therapyWithPatient = Prisma.validator < Prisma.TherapyArgs > ()({
    include: {
        patient: true
    }
})

type TherapyWithPatient = Prisma.TherapyGetPayload < typeof therapyWithPatient > 
const userWithTherapies = Prisma.validator < Prisma.UserArgs > ()({
    include: {
        patient_therapies: true
    }
})

type UserWithTherapies = Prisma.UserGetPayload < typeof userWithTherapies > 
const testWithSessions = Prisma.validator < Prisma.TestArgs > ()({
    include: {
        test_sessions: true
    }
})

type TestWithSessions = Prisma.TestGetPayload < typeof testWithSessions > 
const therapyWithTests = Prisma.validator < Prisma.TherapyArgs > ()({
    include: {
        tests: true
    }
})

type TherapyWithTests = Prisma.TherapyGetPayload < typeof therapyWithTests >
