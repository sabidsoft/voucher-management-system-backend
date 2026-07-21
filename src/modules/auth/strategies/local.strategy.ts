import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import { verify } from "argon2";
import { AuthUser } from "../types/auth.types";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly usersService: UsersService) {
        super({ usernameField: 'email' });
    }

    async validate(email: string, password: string) {
        const user =
            await this.usersService.findByEmail(email);

        if (!user)
            throw new UnauthorizedException('Invalid credentials');

        if (!user.isActive)
            throw new UnauthorizedException('Account is deactivated');

        const isPasswordMatched =
            await verify(user.password, password);

        if (!isPasswordMatched)
            throw new UnauthorizedException('Invalid credentials');

        const authUser: AuthUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
        }

        return authUser;
    }
}
