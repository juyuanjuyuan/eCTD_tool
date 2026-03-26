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
        sequenceNodeId: string;
        content: string;
        mentions: import("@prisma/client/runtime/library").JsonValue | null;
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
            sequenceNodeId: string;
            content: string;
            mentions: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        user: {
            id: string;
            name: string;
        };
        id: string;
        parentId: string | null;
        createdAt: Date;
        userId: string;
        sequenceNodeId: string;
        content: string;
        mentions: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    deleteComment(commentId: string, userId: string, userRole: string): Promise<{
        message: string;
    }>;
    getCommentCount(nodeId: string): Promise<number>;
    private extractMentions;
}
