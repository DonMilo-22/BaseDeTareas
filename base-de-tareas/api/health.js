import { db } from "./_db.js";

export default async function handler(req, res) {
    try {
        const result = await db.execute("SELECT 1 AS ok");

        return res.status(200).json({
            success: true,
            database: result.rows
        });
    } catch (error) {
        console.error("DATABASE TEST ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}