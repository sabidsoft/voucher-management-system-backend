import { PartialType } from '@nestjs/mapped-types';
import { BaseUserDto } from './base-user.dto';

export class UpdateUserDto extends PartialType(BaseUserDto) {}
