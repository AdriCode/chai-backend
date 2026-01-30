import {asyncHandler} from '../utils/asyncHandler.js'
import {ApiError} from "../utils/apiError.js"
import { User } from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/apiResponse.js'

// generate access and refresh token
const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId) 
        if (!user) {
            throw new ApiError(404, "User not found while generating tokens")
        }
        const accessToken =  user.generateAccessToken()
        const refreshToken =  user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false }) // this saves token to db without validation for password, as that field is always required

        return {accessToken,refreshToken}
        
    // }catch (error) {
    //         console.error("TOKEN GENERATION ERROR 👉", error);
    //         throw error; // 👈 rethrow original error
    //     }
        } catch (error) {
        throw new ApiError(500,'something went wrong while generating tokens')
    }
}

const registerUser = asyncHandler( async (req,res)=> {
    // res.status(200).json({
    //     message:"ok"
    // })

    // take values first
    const {fullName, username, email, password} = req.body
    // console.log(email);
    // console.log(username);
    // console.log(password);
    if(
        [fullName, username, email, password].some((field)=> field?.trim()==="")   
    )
    {
        throw new ApiError(400,"All fields are required")
    }

    // now check if user already exits
    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })

    if(existedUser){
        throw new ApiError(409,"User with username or email already exits")
    }
    // console.log(`existed User : ${existedUser}`);
    
    // now check for images, avatar
    
    // now weve seen, most of our content lies in req.body, now multer gives us extra fields
    // back tix cant store object only primitive data types
    // console.log(`req.files  :` , req.files);
    
    const avatarLocalPath = req.files?.avatar[0]?.path
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    // avatar has to be there
    if(!avatarLocalPath)
        throw new ApiError(400,"Avatar file is required")

    // upload to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    // console.log("avatar:" ,avatar);
    if(!avatar)
        throw new ApiError(400,"Avatar file is required")

    // create user object - create entry in db
    const user = await User.create({
        fullName,
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

const loginUser = asyncHandler( async(req,res) => {
    // req.body -> data
    const {username,email, password} = req.body

    // check if username or email is empty
    if(!username && !email){
        throw new ApiError(400,'username or email is requeired')
    }

    // match username or email
    const user = await User.findOne({
        $or: [{username},{email}]
    })

    if(!user)
        throw new ApiError(404,'User does not exist')

    // check if user valid
    const isUsernameValid = await user.isPasswordCorrect(password)
    if(!isUsernameValid)
        throw new ApiError(401, 'Invalid user cred')

    // create access and refresh token
    const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id)

    // take logged in user and display
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    
    const option = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,option)
    .cookie("refreshToken",refreshToken,option)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,accessToken,refreshToken
            },
            "User logged in successfully"
        )
    )
})

const logoutUser = asyncHandler( async(req,res) => {
    // after passing through middle ware, now req has req.user
    User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(200,{},"User logged out")
    )
})

export { 
    registerUser,
    loginUser,
    logoutUser
}      