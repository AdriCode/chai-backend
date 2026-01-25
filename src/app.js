import express from "express";
// cors and cookie parser
import cors from "cors"
import cookieParser from "cookie-parser";


const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN, 
    credentials:true
}))
// accept json
app.use(express.json({limit:"16kb"}))
// accept url
app.use(express.urlencoded({extended:true, limit:"16kb"}))
//  we want to store files, images, pdf in public folder
app.use(express.static('public'))
// to access and set (CRUD op) the cookies in users browser from my server
app.use(cookieParser())

export { app }