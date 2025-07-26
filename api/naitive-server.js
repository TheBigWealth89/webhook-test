import express from "express"
const app = express()
app.post('/webhook', (req, res) => {
    // Tries to process directly
    const payload = JSON.parse(req.body); 
    console.log('Success!', payload);
    res.status(200).send();
});