import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto';
export declare class CommentService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createComment(nodeId: string, userId: string, dto: CreateCommentDto): Promise<{
        user: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        parentId: string | null;
        createdAt: Date;
        userId: string;
        content: string;
        mentions: import("@prisma/client/runtime/library").JsonValue | null;
        sequenceNodeId: string;
    }>;
    getComments(nodeId: string): Promise<{
        replies: ({
            user: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            parentId: string | null;
            createdAt: Date;
            userId: string;
            content: string;
            mentions: import("@prisma/client/runtime/library").JsonValue | null;
            sequenceNodeId: string;
        })[];
        user: {
            id: string;
            name: string;
        };
        id: string;
        parentId: string | null;
        createdAt: Date;
        userId: string;
        content: string;
        mentions: import("@prisma/client/runtime/library").JsonValue | null;
        sequenceNodeId: string;
    }[]>;
    deleteComment(commentId: string, userId: string, userRole: string): Promise<{
        message: string;
    }>;
    getCommentCount(nodeId: string): Promise<number>;
    private extractMentions;
}
