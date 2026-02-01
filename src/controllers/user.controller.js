import {asyncHandler} from '../utils/asyncHandler.js'
import {ApiError} from "../utils/apiError.js"
import { User } from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/apiResponse.js'

// generate access and refresh token: generate access and refresh tokens for a user
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

const refreshAccessToken = asyncHandler(async(req,res)=>{
    // take incoming token
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken)
        throw new ApiError(401,"unauthorised access")

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user= User.findById(decodedToken._id)
        if(!user)
            throw new ApiError(401,"Invalid refresh token")
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body

    

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "User fetched successfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {new: true}
        
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
});

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    //TODO: delete old image - assignment

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }

    //TODO: delete old image - assignment


    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }
    // users collection:
        // {
        //      _id: ObjectId("U1"),
        //      username: "ashwath",
        //      fullName: "Ashwath Bhuyan",
        //      avatar: "avatar.jpg",
        //      coverImage: "cover.jpg",
        //      email: "ash@example.com"
        // }

        // subscriptions collection:
        //      {
        //      _id: ObjectId("S1"),
        //      subscriber: ObjectId("U2"),
        //      channel: ObjectId("U1")
        //      }
        //      {
        //      _id: ObjectId("S2"),
        //      subscriber: ObjectId("U3"),
        //      channel: ObjectId("U1")
        //      }
        //      {
        //      _id: ObjectId("S3"),
        //      subscriber: ObjectId("U1"),
        //      channel: ObjectId("U4")
        //      }
    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()   
            }
            // {
            //     _id: ObjectId("U1"),
            //     username: "ashwath",
            //     fullName: "Ashwath Bhuyan",
            //     avatar: "avatar.jpg",
            //     coverImage: "cover.jpg",
            //     email: "ash@example.com"
            // }
              
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
            // { subscriber: U2, channel: U1 }
            // { subscriber: U3, channel: U1 }

            // ::
            // {
            //     _id: ObjectId("U1"),
            //     username: "ashwath",
            //     fullName: "Ashwath Bhuyan",
            //     avatar: "avatar.jpg",
            //     coverImage: "cover.jpg",
            //     email: "ash@example.com",
              
            //     subscribers: [
            //       { subscriber: ObjectId("U2"), channel: ObjectId("U1") },
            //       { subscriber: ObjectId("U3"), channel: ObjectId("U1") }
            //     ]
            // }
              
              
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
            // {
            //     _id: ObjectId("U1"),
            //     username: "ashwath",
            //     fullName: "Ashwath Bhuyan",
            //     avatar: "avatar.jpg",
            //     coverImage: "cover.jpg",
            //     email: "ash@example.com",
              
            //     subscribers: [
            //       { subscriber: ObjectId("U2"), channel: ObjectId("U1") },
            //       { subscriber: ObjectId("U3"), channel: ObjectId("U1") }
            //     ],
              
            //     subscribedTo: [
            //       { subscriber: ObjectId("U1"), channel: ObjectId("U4") }
            //     ]
            //   }
              
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1

            }
        }
    ])

    if (!channel?.length) {
        throw new ApiError(404, "channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully"
        )
    )
})

export { 
    registerUser,   
    loginUser,  
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword,  
    getCurrentUser, 
    updateAccountDetails,   
    updateUserAvatar,   
    updateUserCoverImage,   
    getUserChannelProfile,
    getWatchHistory
}      