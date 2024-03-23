const express = require("express")
const mongoose = require("mongoose")
const dotenv = require("dotenv")
const helmet = require("helmet")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const { ethers } = require("ethers")


const TokenSchema = new mongoose.Schema({
    name: {type: String},
    address: {type: String },
    chainId: {type: Number },
    distributionAmount: {type: String }
})

const ClaimSchema = new mongoose.Schema({
    ipAddress: {type: String },
    walletAddress: {type: String },
    lastVisit: {type: Date }
}, {timestamps: true})

const ChainSchema = new mongoose.Schema({
    name: {type: String},
    chainId: {type: Number},
    rpcUrl: {type: String}
})

const Token = mongoose.model("Token", TokenSchema, "Tokens")
const Claim = mongoose.model("Claim", ClaimSchema, "Claims")
const Chain = mongoose.model("Chain", ChainSchema, "ChainData")

dotenv.config()
const DATABASE_URL = process.env.DATABASE_URL
const RPC_URL = process.env.RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY

mongoose.connect(DATABASE_URL, {dbName: "Faucet"})
const connection = mongoose.connection
connection.once("open", () => {
    console.log(`App connected to Faucet database.`)
})


const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
})

const app = express()
app.use(limiter)
app.use(helmet({crossOriginResourcePolicy: false}))
app.use(cors())
app.use(express.json())

const PORT = 3000
const REQ_LIMIT = 0
const ABI = [
    "function mint(address recipient, uint256 amount) returns (bool success)"
]

const sendTokens = async (address) => {
    const chainData = await Chain.find().lean()
    const signers = []
    const txRequests = []

    for (let i = 0; i < chainData.length; i++) {
        const provider = new ethers.JsonRpcProvider(chainData[i].rpcUrl)
        signers[i] = new ethers.Wallet(PRIVATE_KEY, provider)
        const tokens = await Token.find({
            chainId: chainData[i].chainId
        }).lean()

        for (let j = 0; j < tokens.length; j++) {
            const contract = new ethers.Contract(tokens[j].address, ABI, provider)
            const amount = tokens[j].distributionAmount
            txRequests[i].push(contract.mint(address, amount))
        }
    }

    const results = await Promise.all(txRequests)
    const receipts = await Promise.all(results.wait())
}


app.get("/", async (req, res) => {
    res.send(`Welcome to the ContinuumDAO API.\n\nTry one of the following routes:\n\t/add-token (POST)\n\t/request-tokens (POST)`)
})

app.get("/chains", async (req, res) => {
    const chains = await Chain.find()
    res.send(chains)
})

app.get("/tokens", async (req, res) => {
    const tokens = await Token.find()
    res.send(tokens)
})

app.post("/add-chain", async (req, res) => {
    try {
        const { body } = req
        if (!body) throw new Error(`No chain passed with POST request.`)

        const { name, chainId, rpcUrl } = body

        const chainExists = await Chain.findOne({
            chainId
        }).lean()

        if (chainExists) throw new Error(`This chain has already been added.`)

        await Chain.create({name, chainId, rpcUrl})

        res.send(`SUCCESS: Chain: ${name}, chain ID: ${chainId}, RPC URL: ${rpcUrl}`)
    } catch (err) {
        console.error(err.message)
        res.status(400).send(err.message)
    }
})

app.post("/add-token", async (req, res) => {
    try {
        const { body } = req
        if (!body) throw new Error(`No token passed with POST request.`)

        const { name, tokenAddress, decimals, chainId, amount } = body

        const address = tokenAddress.toLowerCase()
        const distributionAmount = (ethers.parseUnits(amount, decimals)).toString()

        if (!ethers.isAddress(address)) throw new Error(`Invalid token address.`)

        const addressExistsOnChain = await Token.findOne({
            address,
            chainId
        }).lean()

        if (addressExistsOnChain) throw new Error(`This token on this chain has already been added.`)

        await Token.create({address, chainId, distributionAmount})

        res.send(`SUCCESS: Token: ${name}, address: ${address}, chain ID: ${chainId}, amount: ${distributionAmount}`)
    } catch (err) {
        console.error(err.message)
        res.status(400).send(err.message)
    }
})

app.post("/request-tokens", async (req, res) => {
    const ip = req.headers["x-real-ip"] || req.socket.remoteAddress
    console.log(`Requesting from IP Address: ${ip}`)

    try {
        const { body } = req
        if (!body) throw new Error(`No body passed with POST request.`) // return bad status if no body is passed

        const { walletAddress } = body
        if (!walletAddress) throw new Error(`No wallet address passed with POST request.`)

        const validWalletAddress = ethers.isAddress(walletAddress)
        if (!validWalletAddress) throw new Error(`Invalid wallet address.`)

        let ipClaimed = await Claim.findOne({
            ipAddress
        }).lean()
        let addressClaimed = await Claim.findOne({
            walletAddress
        }).lean()

        if (ipClaimed || addressClaimed) throw new Error(`You have already claimed from the testnet faucet.`)

        const txHash = await sendTokens(walletAddress)

        res.status(200)
    } catch (err) {
        console.error(err.message)
        res.status(400).send(err.message)
    }
})


app.listen(PORT, () => {
    console.log(`CONTINUUM-DAO Faucet listening on port ${PORT}...`)
})