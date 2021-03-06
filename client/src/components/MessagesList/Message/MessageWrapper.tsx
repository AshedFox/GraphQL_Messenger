import React, {useLayoutEffect, useRef} from 'react';
import Message from "./Message";
import {MessageProps} from "./types";
import {useChatsStore} from "../../../stores/chatsStore";
import {useChangeLastSeenMutation} from "../../../data/generated/graphql";

const MessageWrapper = (props: MessageProps) => {
    const item = useRef<HTMLDivElement>(null);
    const end = useRef<HTMLDivElement>(null);
    const {shouldRenewLastSeen, updateChatLastSeen} = useChatsStore();
    const [changeLastSeenMutation] = useChangeLastSeenMutation();

    useLayoutEffect(() => {
        if (shouldRenewLastSeen(props.message.chat.id, props.message.createdAt)) {
            const observer = new IntersectionObserver((e) => {
                if (e[0].isIntersecting) {
                    if (shouldRenewLastSeen(props.message.chat.id, props.message.createdAt)) {
                        changeLastSeenMutation({
                            variables: {
                                chatId: props.message.chat.id,
                                lastSeen: props.message.createdAt
                            }
                        })
                        updateChatLastSeen(props.message.chat.id, props.message.createdAt);
                    }
                }
            }, {rootMargin: "0px", threshold: 0});

            const itemCurrent = item.current;



            if (itemCurrent) {
                observer.observe(itemCurrent);
            }

            return () => itemCurrent ? observer.unobserve(itemCurrent) : undefined;
        }
    }, []);

    return (
        <div ref={item} style={{display: "flex"}}>
            <Message {...props}/>
            <div ref={end}/>
        </div>
    );
};

export default MessageWrapper;
