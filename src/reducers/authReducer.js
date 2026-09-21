import { types } from "../types/types";

// state = {
//     uid='4as4f6s51s16v6svsdc',
//     displayName: 'Daniel Duque'
// }


export const authReducer = (state = {}, action) =>{
    switch (action.type) {
        case types.login:
            return{
                uid: action.payload.uid,
                name: action.payload.displayName
            }
        case types.logout:
            return{ }
    
        default:
            return state;
    }
}