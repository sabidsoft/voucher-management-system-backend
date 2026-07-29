import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from 'src/common/transformers/string.transformer';

// Deliberately name-only — email is permanently read-only for
// self-edit (even for Admins: a single-admin deployment means a
// self-inflicted email lockout would have no recovery path), and
// role is never self-editable (privilege escalation risk).
export class UpdateMyProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Transform(trim)
  name!: string;
}