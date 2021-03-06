import React from 'react';
import styled from "styled-components";
import Function from "./Function";
import {AiOutlineUserAdd} from "react-icons/ai";
import {BiLogOut, BiMoon} from "react-icons/bi";
import {useNavigate} from "react-router-dom";
import {useLogoutMutation} from "../../../data/generated/graphql";
import {useThemeStore} from "../../../stores/themeStore";
import {useUserStore} from "../../../stores/userStore";
import {useCreateChatModalStore} from "../../../stores/createChatModalStore";
import {useFunctionsSideBarStore} from "../../../stores/functionsSideBarStore";
import {useChatsStore} from "../../../stores/chatsStore";

const Container = styled.div`
  display: flex;
  flex-grow: 1;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow-y: auto;
  gap: 3px;
  flex-grow: 1;
`

const FunctionsList = () => {
    const {switchTheme} = useThemeStore();
    const {reset: resetFunctionsSideBar} = useFunctionsSideBarStore();
    const {reset: resetChats} = useChatsStore();
    const {reset: resetUser} = useUserStore();
    const {open} = useCreateChatModalStore();
    const [logout] = useLogoutMutation();
    const navigate = useNavigate();

    const handleThemeSwitch = () => switchTheme();

    const reset = () => {
        resetUser();
        resetChats();
        resetFunctionsSideBar();
    }

    const handleLogout = async () => {
        try {
            const logoutResult = await logout();

            if (logoutResult.data?.logout) {
                reset();
                navigate("/");
            }
        } catch {
            window.alert("Не удалось выйти!");
        }
    }

    return (
        <Container>
            <List>
                <Function icon={<AiOutlineUserAdd size={24}/>} text={"Создать чат"} onClick={open}/>
                <Function icon={<BiMoon size={24}/>} text={"Сменить тему"} onClick={handleThemeSwitch}/>
                <Function icon={<BiLogOut size={24}/>} text={"Выйти из аккаунта"} onClick={handleLogout}/>
            </List>
        </Container>
    );
};

export default FunctionsList;
