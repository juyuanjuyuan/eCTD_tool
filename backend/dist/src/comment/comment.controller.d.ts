import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto';
export declare class CommentController {
    private readonly commentService;
    constructor(commentService: CommentService);
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
    deleteComment(commentId: string, user: {
        id: string;
        role: string;
    }): Promise<{
        message: string;
    }>;
}
