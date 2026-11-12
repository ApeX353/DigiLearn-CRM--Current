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
        '(product.name LIKE :search OR product.category LIKE :search OR product.sku LIKE :search)',
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
    const previousName = product.name;

    Object.assign(product, updateProductDto);
    const updatedProduct = await this.productRepository.save(product);

    let renamedLines = 0;
    if (previousName !== updatedProduct.name) {
      renamedLines = await this.applyRenameToOpenDocuments(
        updatedProduct.id,
        previousName,
        updatedProduct.name,
      );
    }

    await this.activityLogsService.logUpdate(
      'Product',
      updatedProduct.id,
      oldValues,
      updatedProduct,
      userId,
      renamedLines > 0
        ? `Updated product: ${updatedProduct.name} (renamed from "${previousName}"; ${renamedLines} draft document line(s) updated)`
        : `Updated product: ${updatedProduct.name}`,
    );

    return updatedProduct;
  }

  /**
   * When a product is renamed, line items that copied the old name keep
   * showing it — the description is stored as text on document_items so a
   * document reads the same forever.
   *
   * That is deliberate for anything already out in the world: a quote the
   * school has accepted, or an invoice they have paid, records what was
   * actually sold. Silently rewriting it would put the CRM out of step
   * with the PDF the customer is holding.
   *
   * Drafts have not been sent to anyone, so they should follow the
   * product. Only those are updated here, and only where the stored text
   * still matches the OLD name exactly — a line someone has hand-edited
   * is left alone.
   */
  private async applyRenameToOpenDocuments(
    productId: string,
    previousName: string,
    newName: string,
  ): Promise<number> {
    const result = await this.productRepository.manager.query(
      `UPDATE document_items di
          SET description = $1, updated_at = NOW()
        WHERE di.product_id = $2
          AND TRIM(di.description) = TRIM($3)
          AND (
            (di.document_type = 'Quote'
             AND EXISTS (SELECT 1 FROM quotes q
                          WHERE q.id = di.document_id AND q.status = 'Draft'))
            OR
            (di.document_type = 'Invoice'
             AND EXISTS (SELECT 1 FROM invoices i
                          WHERE i.id = di.document_id AND i.status = 'Draft'))
          )`,
      [newName, productId, previousName],
    );
    // node-postgres returns the affected count as rowCount on the result.
    return Array.isArray(result) ? (result[1] ?? 0) : (result?.rowCount ?? 0);
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
