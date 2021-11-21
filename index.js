const express = require('express');
const { MongoClient } = require('mongodb'); // mongodb data
require('dotenv').config(); // for secure env data
const cors = require('cors');  // For cors blocking
const ObjectId = require('mongodb').ObjectId;
const admin = require("firebase-admin");
const { json } = require('express');
// This is a sample test API key.
const stripe = require("stripe")(process.env.STRIPE_CODE);
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors())      // For cors blocking
app.use(express.json());
app.use(fileUpload())

const port = process.env.PORT || 5000;

//Make admin from firebase service account
const serviceAccount =  JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ezvo3.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req,res,next) {
    if (req.headers?.authorization?.startsWith('Bearer ')){
        const token = req.headers.authorization.split(' ')[1];

        try{
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch{

        }
    }
    next();
}
async function run(){
    try{
        await client.connect();
        const database = client.db("Doctors_portal");
        const appointmentsCollection = database.collection("appointments");
        const usersCollection = database.collection("users");
        const doctorsCollection = database.collection("doctors");

        // Add Appointment
        app.post("/appointments", async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment)
            res.json(result)
        })

        // Update Appointment payment status
        /* app.put("/appointments/:id", async (req, res) => {
            const 
            res.json(result)
        }) */
 
        // Get Appointments from server
        app.get("/appointments", verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const query = {email: email, date:date}
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments)
        })

        // Get Specific Appointment From server
        app.get("/appointments/:id", async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const result = await appointmentsCollection.findOne(query);
            res.json(result);
        })

        // Add Doctor with Image
        app.post("/doctors", async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image; // convert image buffer code to img
            const picData = pic.data;
            const encodedPic = picData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorsCollection.insertOne(doctor)
            res.json(result )
        })

        // Get Doctors From server
        app.get("/doctors", async (req, res) => {
            const cursor = doctorsCollection.find({});
            const doctors = await cursor.toArray();
            res.json(doctors)
        })

        // Filter admin from DB
        app.get("/users/:email", async (req, res) =>{
            const email = req.params.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if(user?.role === 'admin'){
                isAdmin = true;
            }
            res.json({admin: isAdmin});
        })       
        // Add Users to DB
        app.post("/users", async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            console.log(user);
            res.json(result);
        })

        // Update user for google sign in
        app.put("/users", async (req, res) => {
            const user = req.body;
            const filter = {email: user.email};
            const options = { upsert: true};
            const updateDoc = {$set: user};
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        })

        // make Admin
        app.put("/users/admin", verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if(requester) {
                const requesterAccount = await usersCollection.findOne({email: requester});
                if(requesterAccount.role === 'admin') {
                    const filter = {email: user.email};
                    const updateDoc = {$set: {role:'admin'}};
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else{
                res.status(403).json({message:'you do not have permeation to make an Admin'})
            }
            /* const filter = {email: user.email};
            const updateDoc = {$set: {role:'admin'}};
            const result = await usersCollection.updateOne(filter, updateDoc); 
            res.json(result);
            */
            
        })

        //Stripe
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({clientSecret: paymentIntent.client_secret})
        })
    }
    finally{
        // await client.close();
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send("Running the Doctors portal server")
});

app.listen(port, () => {
    console.log("Server Running on", port);
})