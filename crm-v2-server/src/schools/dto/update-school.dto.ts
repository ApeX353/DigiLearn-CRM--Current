import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateSchoolDto } from './create-school.dto';
import { IsOptional, IsString } from '@nestjs/class-validator';

export class UpdateSchoolDto extends PartialType(CreateSchoolDto) {

    @ApiProperty({type: String, example: 'John Doe' })
    @IsOptional()
    @IsString()
    principal_name?: string;
}
