import {asyncHandler} from '../utils/asyncHandler.js'
import {ApiError} from "../utils/apiError.js"
import { User } from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/apiResponse.js'

const registerUser = asyncHandler( async (req,res)=> {
    // res.status(200).json({
    //     message:"ok"
    // })

    // take values first
    const {fullname, username, email, password} = req.body
    // console.log(email);
    // console.log(username);
    // console.log(password);
    if(
        [fullname, username, email, password].some((field)=> field?.trim()==="")   
    )
    {
        throw new ApiError(400,"All fields are required")
    }

    // now check if user already exits
    const existedUser = User.findOne({
        $or: [{username},{email}]
    })

    if(existedUser){
        throw new ApiError(409,"User with username or email already exits")
    }

    // now check for images, avatar

    // now weve seen, most of our content lies in req.body, now multer gives us extra fields
    const avatarLocalPath = req.files?.avatar[0]?.path
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    // avatar has to be there
    if(!avatarLocalPath)
        throw new ApiError(400,"Avatar file is required")

    // upload to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar)
        throw new ApiError(400,"Avatar file is required")

    // create user object - create entry in db
    const user = await User.create({
        fullname,
        username: username.toLowerCase(),
        email,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    })

    // remove password and token fields

    // _id : is a unique value for each entity
    // this gives us user object without password and refresh token
    const createdUser= await User.findById(user._id).select(
        "-password -refreshToken"
    )
    
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // return res( api response )
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User successfully registered")
    )

})  

    
export { 
    registerUser 
}      