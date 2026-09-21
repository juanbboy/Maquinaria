import React from 'react'
import GoogleButton from 'react-google-button'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import './LoginScreen.css';
import { useForm } from '../../hooks/useForm'
import { startLoginEmailPassword, startGoogleLogin } from '../../actions/auth'
import { removeError } from '../../actions/ui';

const LoginScreen = () => {

    const CLOUD_NAME = "dr64wmtkm"
    const dispatch = useDispatch();
    const { loading } = useSelector(state => state.ui)
    const { msgError } = useSelector(state => state.ui);

    const [formValues, handleInputChange] = useForm({
        email: '',
        password: '',
    });

    const { email, password } = formValues;

    const handleGoogleLogin = () => {
        console.log('Google Login TODO');
        dispatch(startGoogleLogin());
        dispatch(removeError())
    }

    const handleLogin = (e) => {
        e.preventDefault();
        dispatch(startLoginEmailPassword(email, password));
        dispatch(removeError())
    }

    return (

        <body className="text-center">
            <main className="form-signin">
                <form onSubmit={handleLogin}>
                    <img className="mb-4 rounded mx-auto d-block" src={`https://res.cloudinary.com/${CLOUD_NAME}/3_d2jfm9`} alt="login" width="290" height="70" />
                    <h1 className="h3 mb-3 fw-normal">Iniciar sesion</h1>
                    {
                        msgError && (
                            <div className="alert alert-danger" role="alert">
                                {msgError}
                            </div>
                        )
                    }
                    <div className="form-floating">
                        <input
                            type="email"
                            className="form-control"
                            id="floatingInput"
                            placeholder="name@example.com"
                            v-model="student.email"
                            name="email"
                            value={email}
                            onChange={handleInputChange}
                            required />

                        <label htmlFor="floatingInput">Correo electronico</label>
                    </div>

                    <div className="form-floating">
                        <input
                            type="password"
                            className="form-control"
                            id="floatingPassword"
                            placeholder="Password"
                            v-model="student.password"
                            name="password"
                            value={password}
                            onChange={handleInputChange}
                            required />
                        <label htmlFor="floatingPassword">Password</label>
                    </div>
                    {/* <div v-if="alerta" className="alert alert-danger" role="alert">
                    {{ alerta }}
                </div> */}
                    <div className="form-group">
                        <button className="w-100 btn btn-lg btn-primary" type="submit" disabled={loading}>Entrar</button>
                    </div>
                    <div className="container mt-3">
                        <GoogleButton type='dark' onClick={handleGoogleLogin} />
                        <hr />
                        <Link to="/register"> Crear nueva cuenta </Link>
                    </div>
                    <p className="mt-5 mb-3 text-muted">&copy; Universidad Tecnologica de Pereira 2021</p>
                </form>
            </main>
        </body>
    )
}
export default LoginScreen
