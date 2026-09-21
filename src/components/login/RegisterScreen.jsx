import React from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import validator from 'validator';
import { startRegisterEmailPassword } from '../../actions/auth';
import { useForm } from '../../hooks/useForm';
import { setError, removeError } from '../../actions/ui';


const RegisterScreen = () => {

    const dispatch = useDispatch();
    const { msgError } = useSelector(state => state.ui);
    const [formValues, handleInputChange] = useForm({
        name: '',
        email: '',
        password: '',
        password2: '',
        terms: true
    });
    const { name, email, password, password2, terms } = formValues;

    const isFormValid = () => {

        if (name.trim().length < 2) {
            // console.log('nombre requerido');
            dispatch(setError('Nombre Requerido'));
            return false;
        } else if (password.length < 6 || password !== password2) {
            // console.log('Longitud mínima de 6 caracteres y ser iguales')
            dispatch(setError('Longitud mínima de 6 caracteres y ser iguales'));
            return false;
        } else if (!terms) {
            dispatch(setError('Marque la casilla para continuar'));
            return false;
        } else if (!validator.isEmail(email)) {
            dispatch(setError('Email Erroneo'));
            return false;
        }
        dispatch(removeError());
        return true;
    }


    const handleRegister = (e) => {
        e.preventDefault();
        if (isFormValid()) {
            dispatch(startRegisterEmailPassword(email, password, name));
        }
    }


    return (
        <div class="row justify-content-center">
            <div class="col-md-5 padding:5px">
                <h3 class="text-center">Crear Usuario</h3>
                <form onSubmit={handleRegister}>
                    {
                        msgError && (
                            <div className="alert alert-danger" role="alert">
                                {msgError}
                            </div>
                        )
                    }

                    <div className="mb-3">
                        <label htmlFor="exampleInputPassword1" className="form-label">Nombre Completo</label>
                        <input
                            type="text"
                            className="form-control"
                            id="exampleInputname"
                            name="name"
                            value={name}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="exampleInputEmail1" className="form-label">Correo electronico</label>
                        <input
                            type="email"
                            className="form-control"
                            id="exampleInputEmail1"
                            aria-describedby="emailHelp"
                            name="email"
                            value={email}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="exampleInputPassword1" className="form-label">Contraseña</label>
                        <input
                            type="password"
                            className="form-control"
                            id="exampleInputPassword1"
                            name="password"
                            value={password}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="exampleInputPassword1" className="form-label">Confirme contraseña</label>
                        <input
                            type="password"
                            className="form-control"
                            id="exampleInputPassword2"
                            name="password2"
                            value={password2}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <div className="form-check">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                name="terms"
                                checked={terms}
                                id="invalidCheck2"
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                    </div>
                    <button className="w-100 btn btn-lg btn-primary" type="submit">Crear cuenta</button>
                </form>

                <div className="mt-3">
                    <hr />
                    <Link to="/login"> Ya estoy registrado </Link>
                </div>
            </div>
        </div >
    )

}

export default RegisterScreen
