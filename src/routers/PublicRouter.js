import { Navigate } from 'react-router-dom';

const PublicRouter = ({ children, isLogged, lastPath }) => {

    return !isLogged
        ? children
        : <Navigate to={lastPath} />
}

export default PublicRouter
