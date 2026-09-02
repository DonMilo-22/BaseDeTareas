import { db, initDatabase } from "./_db.js";

export default async function handler(req, res) {
    try {
        await initDatabase();

        const tests = {};

        const tasks = await db.execute(
            "SELECT COUNT(*) as count FROM tasks;"
        );
        tests.tasks = tasks.rows;

        const classes = await db.execute(
            "SELECT COUNT(*) as count FROM classes;"
        );
        tests.classes = classes.rows;

        const users = await db.execute(
            "SELECT COUNT(*) as count FROM users;"
        );
        tests.users = users.rows;

        const completions = await db.execute(
            "SELECT COUNT(*) as count FROM task_completions WHERE completed = 1;"
        );
        tests.completions = completions.rows;

        return res.status(200).json({
            success: true,
            tests
        });

    } catch (error) {
        console.error("TEST STATS ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}