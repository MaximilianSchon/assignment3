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
import { AnnotationService } from "../services/AnnotationService";

@Controller("/")
export class IndexController {

    @Inject()
    private userService : UserService;

    @Inject()
    private annotationService : AnnotationService;

    @Post('/annotate')
    @AuthRoles('researcher', 'junior researcher', 'physician')
    async annotate(@Req("session") session: any, @Req("X") X: number, @Req("X") Y: number, @Req("test_session") testSessionId: number, @Req("text") annotation: string) {
        const { patients } = await this.getUserWithPatients(JSON.parse(session.passport.user).userID)
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
        ], []).map(s => s.test_SessionID)
        if (!sessions.include(testSessionId)) {
            throw new Forbidden("You are not allowed to modify this session")
        }
        return this.annotationService.create({data: {
            X,
            Y,
            test_Session_IDTest_Session: testSessionId,
            annotation,
        }})
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

    @Get("/sessions/:session")
    @AuthRoles('researcher', 'physician')
    @View("data-viz.ejs")
    async data(@PathParams("session")session : string, @Req()request : any, @Res()response : Res) {
        const userSession = JSON.parse(request.session.passport.user)
        const d = await this.getDataFromUserId(parseInt(session), userSession.userID)
        const user = await this.userService
        .findUnique({
            where: {
                userID: userSession.userID
            }});

        return {user, ...d, session: session}
    }


    async getDataFromUserId(session: number, userId: number) {
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
        ], []).filter((s: Test_Session) => s.test_SessionID === session)
        const type = sessions[0].type;
        const file = sessions[0].dataURL
        const csvPath = path.join(__dirname, `../data/${file}.csv`);
        // https://stackoverflow.com/questions/67256503/csv-to-json-list-of-arrays
        const json = await csv().fromFile(csvPath)
        return {data: json, type, annotations: sessions[0].annotations}
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
                                                            },
                                                            annotations: true
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
