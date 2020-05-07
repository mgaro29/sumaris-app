import {
  DataEntity,
  DataEntityAsObjectOptions,
  EntityUtils,
  isNil,
  isNotNil, IWithPacketsEntity, IWithProductsEntity,
  NOT_MINIFY_OPTIONS, PmfmStrategy,
  ReferentialRef, referentialToString
} from "./base.model";
import {ReferentialAsObjectOptions} from "../../../core/services/model";
import {DataFilter} from "../../../shared/services/memory-data-service.class";
import {PacketSale} from "./packet-sale.model";

export class PacketFilter implements DataFilter<Packet> {

  parent?: IWithPacketsEntity<any>;

  constructor(parent?: IWithPacketsEntity<any>) {
    this.parent = parent || null;
  }

  test(data: Packet): boolean {
    if (isNotNil(this.parent)) {
      return this.parent.equals(data.parent);
    }
    return true;
  }
}

export class Packet extends DataEntity<Packet> {

  static fromObject(source: any): Packet {
    const target = new Packet();
    target.fromObject(source);
    return target;
  }

  static TYPENAME = 'PacketVO';

  rankOrder: number;
  number: number;
  weight: number;
  // sampledWeights: number[];
  sampledWeight1: number;
  sampledWeight2: number;
  sampledWeight3: number;
  sampledWeight4: number;
  sampledWeight5: number;
  sampledWeight6: number;
  composition: PacketComposition[];
  packetSales: PacketSale[];

  // used to compute packet's ratio from composition
  sampledRatio1: number;
  sampledRatio2: number;
  sampledRatio3: number;
  sampledRatio4: number;
  sampledRatio5: number;
  sampledRatio6: number;

  parent: IWithPacketsEntity<any>;
  parentId: number;

  constructor() {
    super();
    this.rankOrder = null;
    this.number = null;
    this.weight = null;
    // this.sampledWeights = [];
    this.composition = [];
    this.packetSales = [];
    this.parent = null;
    this.parentId = null;
  }

  asObject(options?: DataEntityAsObjectOptions): any {
    const target = super.asObject(options);
    target.sampledWeights = [this.sampledWeight1, this.sampledWeight2, this.sampledWeight3, this.sampledWeight4, this.sampledWeight5, this.sampledWeight6];
    delete target.sampledWeight1;
    delete target.sampledWeight2;
    delete target.sampledWeight3;
    delete target.sampledWeight4;
    delete target.sampledWeight5;
    delete target.sampledWeight6;
    target.composition = this.composition && this.composition.map(c => c.asObject(options)) || undefined;
    target.operationId = this.parent && this.parent.id || this.parentId;

    // packetSales is only for screens
    delete target.packetSales;

    return target;
  }

  fromObject(source: any): DataEntity<Packet> {
    super.fromObject(source);
    this.rankOrder = source.rankOrder;
    this.number = source.number;
    this.weight = source.weight;
    // this.sampledWeights = source.sampledWeights;
    this.sampledWeight1 = source.sampledWeights && source.sampledWeights[0] || source.sampledWeight1;
    this.sampledWeight2 = source.sampledWeights && source.sampledWeights[1] || source.sampledWeight2;
    this.sampledWeight3 = source.sampledWeights && source.sampledWeights[2] || source.sampledWeight3;
    this.sampledWeight4 = source.sampledWeights && source.sampledWeights[3] || source.sampledWeight4;
    this.sampledWeight5 = source.sampledWeights && source.sampledWeights[4] || source.sampledWeight5;
    this.sampledWeight6 = source.sampledWeights && source.sampledWeights[5] || source.sampledWeight6;
    this.composition = source.composition && source.composition.map(c => PacketComposition.fromObject(c));
    this.parentId = source.operationId;
    this.parent = source.parent;
    return this;
  }

  clone(): Packet {
    const target = new Packet();
    target.fromObject(this.asObject());
    return target;
  }

  addPacketSale(packetSale: PacketSale) {

    // find packet sale with same rank order
    const existingPacketSale = this.packetSales.find(s => s && s.rankOrder === packetSale.rankOrder);
    if (existingPacketSale) {

      // Some assertions
      if (existingPacketSale.number !== packetSale.number)
        throw new Error(`Invalid packet sale: different packet number found: ${existingPacketSale.number} != ${packetSale.number}`);
      if (isNil(packetSale.saleType) || !packetSale.saleType.equals(existingPacketSale.saleType))
        throw new Error(`Invalid packet sale: different sale type found:
        ${existingPacketSale.saleType && existingPacketSale.saleType.name || null} != ${packetSale.saleType && packetSale.saleType.name || null}`);

      // Sum values
      if (existingPacketSale.weight && packetSale.weight)
        existingPacketSale.weight += packetSale.weight;
      if (existingPacketSale.averagePackagingPrice && packetSale.averagePackagingPrice)
        existingPacketSale.averagePackagingPrice += packetSale.averagePackagingPrice;
      if (existingPacketSale.totalPrice && packetSale.totalPrice)
        existingPacketSale.totalPrice += packetSale.totalPrice;

    } else {

      // just add to array
      this.packetSales.push(packetSale);

    }
  }

}

export class PacketComposition extends DataEntity<PacketComposition> {

  static TYPENAME = 'PacketCompositionVO';

  rankOrder: number;
  taxonGroup: ReferentialRef;
  // ratios: number[];
  ratio1: number;
  ratio2: number;
  ratio3: number;
  ratio4: number;
  ratio5: number;
  ratio6: number;
  weight: number;

  constructor() {
    super();
    this.rankOrder = null;
    this.taxonGroup = null;
    this.weight = null;
    // this.ratios = [];
  }

  asObject(options?: DataEntityAsObjectOptions): any {
    const target = super.asObject(options);

    target.taxonGroup = this.taxonGroup && this.taxonGroup.asObject({...options, ...NOT_MINIFY_OPTIONS, keepEntityName: true} as ReferentialAsObjectOptions) || undefined;
    target.ratios = [this.ratio1, this.ratio2, this.ratio3, this.ratio4, this.ratio5, this.ratio6];
    delete target.ratio1;
    delete target.ratio2;
    delete target.ratio3;
    delete target.ratio4;
    delete target.ratio5;
    delete target.ratio6;
    delete target.weight;

    return target;
  }

  fromObject(source: any): PacketComposition {
    super.fromObject(source);
    this.rankOrder = source.rankOrder || undefined;
    this.taxonGroup = source.taxonGroup && ReferentialRef.fromObject(source.taxonGroup) || undefined;
    // this.ratios = source.ratios || undefined;
    this.ratio1 = source.ratios && source.ratios[0] || source.ratio1;
    this.ratio2 = source.ratios && source.ratios[1] || source.ratio2;
    this.ratio3 = source.ratios && source.ratios[2] || source.ratio3;
    this.ratio4 = source.ratios && source.ratios[3] || source.ratio4;
    this.ratio5 = source.ratios && source.ratios[4] || source.ratio5;
    this.ratio6 = source.ratios && source.ratios[5] || source.ratio6;
    return this;
  }

  clone(): PacketComposition {
    return PacketComposition.fromObject(this.asObject());
  }

  static fromObject(source: any) {
    if (isNil(source)) return null;
    const res = new PacketComposition();
    res.fromObject(source);
    return res;
  }

}

export class PacketUtils {

  static isPacketEmpty(packet: Packet): boolean {
    return !packet || isNil(packet.number);
  }

  static isPacketCompositionEmpty(composition: PacketComposition): boolean {
    return !composition || isNil(composition.taxonGroup);
  }

  static isPacketCompositionEquals(composition1: PacketComposition, composition2: PacketComposition): boolean {
    return (composition1 === composition2) || (isNil(composition1) && isNil(composition2)) || (
      composition1 && composition2 && EntityUtils.equals(composition1.taxonGroup, composition2.taxonGroup)
      && composition1.ratio1 === composition2.ratio1
      && composition1.ratio2 === composition2.ratio2
      && composition1.ratio3 === composition2.ratio3
      && composition1.ratio4 === composition2.ratio4
      && composition1.ratio5 === composition2.ratio5
      && composition1.ratio6 === composition2.ratio6
    );
  }

  static getComposition(packet: Packet) {
    return packet && packet.composition && packet.composition.map(composition => referentialToString(composition.taxonGroup)).join('\n') || "";
  }
}
