import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { isEmail } from 'class-validator';
import { PrismaClient, Role, Status } from 'src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString)
    throw new Error('DATABASE_URL is not defined');

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

const MIN_PASSWORD_LENGTH = 8;

async function main() {
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminName || !adminEmail || !adminPassword)
        throw new Error('ADMIN_NAME, ADMIN_EMAIL or ADMIN_PASSWORD is not defined');

    if (!isEmail(adminEmail))
        throw new Error('ADMIN_EMAIL is not a valid email address');

    if (adminPassword.length < MIN_PASSWORD_LENGTH)
        throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);

    const existing = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (existing) {
        console.log('Admin already exists');
        return;
    }

    const hashedPassword = await hash(adminPassword);

    await prisma.user.create({
        data: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            status: Status.ACTIVE,
            role: Role.ADMIN,
        },
    });

    console.log('Admin created successfully');
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });