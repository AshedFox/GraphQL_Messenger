import React from 'react';
import styled from "styled-components";
import LoginForm from '../../components/LoginForm';


const Container = styled.div`
  display: flex;
  flex-direction: row;
  width: 100vw;
  height: 100vh;
  background-color: ${props => props.theme.primaryBg};
  transition: background-color 0.4s;
`

const ImageContainer = styled.div`
  overflow: hidden;
  flex: 1;
`

const Image = styled.img`
  object-fit: cover;
  height: 100%;
  width: 100%;
`


const LoginPage = () => {
    return (
        <Container>
            <LoginForm/>
            <ImageContainer>
                <Image src={require("../../assets/images/img.png")} alt={"bg"}/>
            </ImageContainer>
        </Container>
    );
};

export default LoginPage;
