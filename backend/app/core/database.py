from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> None:
    global client
    client = AsyncIOMotorClient(settings.mongodb_uri)
    await get_database().command("ping")


async def close_mongo_connection() -> None:
    if client:
        client.close()


async def ensure_indexes() -> None:
    db = get_database()
    await db.users.create_index("email", unique=True)
    await db.users.create_index([("role", 1), ("is_active", 1), ("created_at", -1)])
    await db.accounts.create_index("code", unique=True)
    await db.accounts.create_index("name", unique=True)
    await db.accounts.create_index([("type", 1), ("group", 1), ("code", 1)])
    await db.journal_entries.create_index("voucher_no", unique=True)
    await db.journal_entries.create_index([("status", 1), ("date", -1)])
    await db.journal_entries.create_index([("entries.account", 1), ("status", 1), ("date", 1)])
    await db.vouchers.create_index("voucher_no", unique=True)
    await db.vouchers.create_index([("status", 1), ("type", 1), ("date", -1)])
    await db.transactions.create_index([("book", 1), ("date", 1), ("_id", 1)])
    await db.transactions.create_index("voucher_no")
    await db.notifications.create_index([("audience", 1), ("created_at", -1)])
    await db.notification_reads.create_index([("notification_id", 1), ("user_id", 1)], unique=True)
    await db.password_reset_otps.create_index("expires_at", expireAfterSeconds=0)
    await db.auth_rate_limits.create_index("updated_at", expireAfterSeconds=86400)


def get_database():
    if client is None:
        raise RuntimeError("MongoDB client is not connected")
    return client[settings.mongodb_db]
