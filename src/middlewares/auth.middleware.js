// import { JsonWebTokenError } from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js";

const verifyJWT = asyncHandler(async(req,_,next)=>{
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
    
        if(!token)
            throw new ApiError(401,"Unauthorized request")
    
        const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
    
        if(!user)
            throw new ApiError(401,"Inavlid Access Token")
    
        // create new entry
        req.user=user
        next()
    } catch (error) {
        throw new ApiError(401,"Inavalid access token")
    }
}) 

export { verifyJWT }