import {Inject, Injectable} from "@tsed/di";
import {Prisma, Annotation} from "@prisma/client";
import {PrismaService} from "./PrismaService";

@Injectable()
export class AnnotationService {
  @Inject()
  prisma: PrismaService;

  async findUnique(args: Prisma.AnnotationFindUniqueArgs): Promise<Annotation | null> {
    return this.prisma.annotation.findUnique(args);
  }

  async findMany(args?: Prisma.AnnotationFindManyArgs): Promise<Annotation[]> {
    return this.prisma.annotation.findMany(args);
  }

  async create(args: Prisma.AnnotationCreateArgs): Promise<Annotation> {
    return this.prisma.annotation.create(args);
  }

  async update(args: Prisma.AnnotationUpdateArgs): Promise<Annotation> {
    return this.prisma.annotation.update(args);
  }

  async delete(args: Prisma.AnnotationDeleteArgs): Promise<Annotation> {
    return this.prisma.annotation.delete(args);
  }
}