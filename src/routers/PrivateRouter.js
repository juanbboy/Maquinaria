import { Navigate, useLocation } from 'react-router-dom';

const PrivateRouter = ({ children, isLogged }) => {

    const { pathname, search } = useLocation();
    localStorage.setItem('lastPath', pathname + search);

    return isLogged
        ? children
        : <Navigate to="/login" />
}

export default PrivateRouter
