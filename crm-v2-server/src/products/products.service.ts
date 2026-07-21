import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    userId: string,
  ): Promise<Product> {
    const product = this.productRepository.create(createProductDto);
    const savedProduct = await this.productRepository.save(product);

    await this.activityLogsService.logCreate(
      'Product',
      savedProduct.id,
      savedProduct,
      userId,
      `Created product: ${savedProduct.name}`,
    );

    return savedProduct;
  }

  async findAll(query: QueryProductDto): Promise<Pagination<Product>> {
    const {
      page = '1',
      limit = '10',
      search,
      product_type,
      category,
      is_active,
    } = query;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .where('product.deleted_at IS NULL');

    if (is_active !== undefined) {
      queryBuilder.andWhere('product.is_active = :isActive', {
        isActive: is_active,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(product.name LIKE :search OR product.category LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (product_type) {
      queryBuilder.andWhere('product.product_type = :type', {
        type: product_type,
      });
    }

    if (category) {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    queryBuilder.orderBy('product.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<Product>(queryBuilder, options);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ): Promise<Product> {
    const product = await this.findOne(id);
    const oldValues = { ...product };

    Object.assign(product, updateProductDto);
    const updatedProduct = await this.productRepository.save(product);

    await this.activityLogsService.logUpdate(
      'Product',
      updatedProduct.id,
      oldValues,
      updatedProduct,
      userId,
      `Updated product: ${updatedProduct.name}`,
    );

    return updatedProduct;
  }

  async remove(id: string, userId: string): Promise<void> {
    const product = await this.findOne(id);

    await this.productRepository.softDelete(id);

    await this.activityLogsService.logDelete(
      'Product',
      product.id,
      product,
      userId,
      `Deleted product: ${product.name}`,
    );
  }

  async restore(id: string, userId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!product || !product.deleted_at) {
      throw new NotFoundException('Product not found or not deleted');
    }

    await this.productRepository.restore(id);
    const restoredProduct = await this.findOne(id);

    await this.activityLogsService.logCreate(
      'Product',
      restoredProduct.id,
      restoredProduct,
      userId,
      `Restored product: ${restoredProduct.name}`,
    );

    return restoredProduct;
  }
}
