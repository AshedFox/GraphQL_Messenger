import {
    Arg,
    Args,
    Ctx,
    Field,
    FieldResolver,
    ID,
    Mutation,
    ObjectType,
    PubSub,
    PubSubEngine,
    Query,
    Resolver,
    Root,
    Subscription,
    UseMiddleware
} from "type-graphql";
import {ChatUser} from "../enitities/ChatUser";
import {authMiddleware} from "../../middlewares/authMiddleware";
import {MyContext} from "../../types/MyContext";
import {Chat} from "../enitities/Chat";
import {User} from "../enitities/User";
import {ChatUserStatus} from "../enitities/ChatUserStatus";
import {HttpQueryError} from "apollo-server-core";
import {SubscriptionType} from "./SubscriptionType";
import {ChatUsersArgs} from "../args/ChatUsersArgs";


@ObjectType()
export class ChatUsersResult {
    @Field(() => [ChatUser])
    chatUsers!: ChatUser[];

    @Field()
    hasMore!: boolean;
}

@Resolver(ChatUser)
export class ChatUserResolver {
    @FieldResolver(() => Chat)
    async chat(@Root() chatUser: ChatUser): Promise<Chat | null> {
        return await Chat.findOne({where: {id: chatUser.chatId}, withDeleted: true});
    }

    @FieldResolver(() => User)
    async user(@Root() chatUser: ChatUser): Promise<User | null> {
        return await User.findOne({where: {id: chatUser.userId}, withDeleted: true});
    }

    @UseMiddleware(authMiddleware)
    @Query(() => ChatUser)
    async chatUser(@Arg("userId", () => ID) userId: string, @Arg("chatId", () => ID) chatId: string): Promise<ChatUser | null> {
        return await ChatUser.findOneBy({userId, chatId});
    }

    @UseMiddleware(authMiddleware)
    @Query(() => ChatUsersResult)
    async chatUsers(@Args() {chatId, count, lastUserId, lastCreatedAt}: ChatUsersArgs): Promise<ChatUsersResult> {
        const chat = await Chat.findOneBy({id: chatId});

        if (!chat) {
            throw new HttpQueryError(404, "Chat with passed id not found!");
        }

        let queryBuilder = ChatUser.createQueryBuilder("chatUser")
            .where('chatUser.chatId = :chatId', {chatId})

        if (lastCreatedAt && lastUserId) {
            queryBuilder = queryBuilder
                .andWhere('(chatUser.createdAt, chatUser.userId) < (:createdAt, :userId)',
                    {createdAt: lastCreatedAt, userId: lastUserId}
                );
        }

        if (count !== -1) {
            queryBuilder = queryBuilder.take(count);
        }

        queryBuilder = queryBuilder
            .orderBy({
                "chatUser.createdAt": "ASC",
                "chatUser.userId": "ASC",
            });

        const [chatUsers] = await queryBuilder.getManyAndCount();

        return {
            chatUsers,
            hasMore: count === chatUsers.length
        }
    }

    @UseMiddleware(authMiddleware)
    @Mutation(() => ChatUser)
    async joinChat(@Arg("chatId", () => ID) chatId: string, @Ctx() context: MyContext,
                   @PubSub() pubSub: PubSubEngine): Promise<ChatUser> {
        const chat = await Chat.findOneBy({id: chatId});

        if (!chat) {
            throw new HttpQueryError(404, "Chat not found");
        }

        const chatUser = await ChatUser.findOne({
            where: {chatId: chatId, userId: context.req.userId},
            withDeleted: true
        });

        if (!chatUser) {
            const chatUser = await ChatUser.create({chatId: chatId, userId: context.req.userId, lastSeen: new Date()});
            await chatUser.save();

            await pubSub.publish(`${SubscriptionType.CHAT_JOINED}_${chatUser.userId}`, chat);
            await pubSub.publish(`${SubscriptionType.CHAT_USER_JOINED}_${chatUser.chatId}`, chatUser);

            return chatUser;
        } else {
            if (chatUser.userId !== context.req.userId) {
                throw new HttpQueryError(403, "Forbidden");
            }

            if (!(chatUser.status & ChatUserStatus.LEAVED)) {
                throw new HttpQueryError(409, "User already joined")
            }

            await chatUser.recover();
            chatUser.lastSeen = new Date();
            await chatUser.save();

            await pubSub.publish(`${SubscriptionType.CHAT_JOINED}_${chatUser.userId}`, chat);
            await pubSub.publish(`${SubscriptionType.CHAT_USER_JOINED}_${chatUser.chatId}`, chatUser);

            return chatUser;
        }
    }

    @UseMiddleware(authMiddleware)
    @Mutation(() => Boolean)
    async leaveChat(@Arg("chatId", () => ID) chatId: string, @Ctx() context: MyContext,
                    @PubSub() pubSub: PubSubEngine): Promise<boolean> {
        const chat = await Chat.findOneBy({id: chatId})

        if (!chat) {
            throw new HttpQueryError(404, "Chat not found");
        }

        const chatUser = await ChatUser.findOne({
            where: {chatId: chatId, userId: context.req.userId},
            withDeleted: true
        });

        if (!chatUser) {
            throw new HttpQueryError(404, "Chat user not found");
        }

        if (chatUser.userId !== context.req.userId) {
            throw new HttpQueryError(403, "Forbidden");
        }

        if (chatUser.status & ChatUserStatus.LEAVED) {
            throw new HttpQueryError(409, "User already leaved")
        }

        await chatUser.softRemove();
        await chatUser.save();

        await pubSub.publish(`${SubscriptionType.CHAT_USER_LEAVED}_${chatUser.chatId}`, chatUser);
        await pubSub.publish(`${SubscriptionType.CHAT_LEAVED}_${chatUser.userId}`, chat);

        return true;
    }

    @UseMiddleware(authMiddleware)
    @Mutation(() => Boolean)
    async changeLastSeen(@Arg("chatId", () => ID) chatId: string,
                         @Arg("lastSeen") lastSeen: Date,
                         @Ctx() context: MyContext, @PubSub() pubSub: PubSubEngine): Promise<boolean> {
        const chat = await Chat.findOneBy({id: chatId})

        if (!chat) {
            throw new HttpQueryError(404, "Chat not found");
        }

        const chatUser = await ChatUser.findOneBy({chatId: chatId, userId: context.req.userId});

        if (!chatUser) {
            throw new HttpQueryError(404, "Chat user not found");
        }

        if (chatUser.userId !== context.req.userId) {
            throw new HttpQueryError(403, "Forbidden");
        }

        if (chatUser.lastSeen && chatUser.lastSeen >= lastSeen) {
            return false;
        }

        chatUser.lastSeen = lastSeen;
        await chatUser.save();
        await pubSub.publish(`${SubscriptionType.CHANGE_LAST_SEEN}_${chatUser.userId}`, chatUser);

        return true;
    }

    @Subscription(() => ChatUser, {
        topics: (data) => `${SubscriptionType.CHANGE_LAST_SEEN}_${data.args.userId}`,
    })
    async lastSeenChanged(@Root() chatUser: ChatUser, @Arg("userId", () => ID) userId: string): Promise<ChatUser> {
        return chatUser;
    }

    @Subscription(() => ChatUser, {
        topics: (data) => `${SubscriptionType.CHAT_USER_JOINED}_${data.args.chatId}`,
    })
    async chatUserJoined(@Root() chatUser: ChatUser, @Arg("chatId", () => ID) chatId: string): Promise<ChatUser> {
        return chatUser;
    }

    @Subscription(() => ChatUser, {
        topics: (data) => `${SubscriptionType.CHAT_USER_LEAVED}_${data.args.chatId}`,
    })
    async chatUserLeaved(@Root() chatUser: ChatUser, @Arg("chatId", () => ID) chatId: string): Promise<ChatUser> {
        return chatUser;
    }

    @Subscription(() => ChatUser, {
        topics: (data) => `${SubscriptionType.CHAT_USER_UPDATED}_${data.args.chatId}`,
    })
    async chatUserUpdated(@Root() chatUser: ChatUser, @Arg("chatId", () => ID) chatId: string): Promise<ChatUser> {
        return chatUser;
    }
}
