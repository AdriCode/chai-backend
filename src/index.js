// require('dotenv').config({path:./env}) 
// this is just how to connect the db
import dotenv from "dotenv"
import connectDB from "./db/index.js"
import {app} from './app.js'

dotenv.config({
    path: "./.env"
})




// this is an asynchronous function, this returns a promise 
connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000 , ()=>{
        console.log('Server is running at port: ',process.env.PORT);
    })
})
.catch((e)=>{
    console.log("DB mongo connection failed !!", e);
})


// import mongoose from "mongoose";
// import {DB_NAME} from "./constants"

// import express from "express";
// const app = express()
// // to run a function instantly , we call it by ()()
// // we use asyc beacause we are talling to the database , so db is alawsys in another continent 
// ( async ()=> {
//     try {
//         await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
//         app.on('error',(e)=>{
//             console.log("Error: ",e);
//             throw e;
//         })
        
//         app.listen(process.env.PORT, ()=>{
//             console.log('Listening on port : ', process.env.PORT);
//         })
//     } catch (error) {
//         console.error("ERROR: ",error);
//         throw error;
//     }
// })()