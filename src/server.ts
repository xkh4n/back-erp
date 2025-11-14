/* LOGS */
import Log4js from "log4js";
const logger = Log4js.getLogger();
logger.level = "all";

/* EXPRESS */
import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();

app.use(cors());
app.use(express.json());

/* ENCODED */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ROUTES */
import {
    health,
    country,
    cities,
    states
} from "./routes";

/* CONFIGURE ROUTES */
const base_path = "/api/" + process.env.API_VERSION + "/";
app.use(base_path, health);
app.use(base_path,  country);
app.use(base_path, cities);
app.use(base_path, states);

/* STATICS FOLDERS */
app.use(express.static("uploads"));
app.use(express.static("uploads/avatars"));
app.use(express.static("uploads/files"));

export default app;