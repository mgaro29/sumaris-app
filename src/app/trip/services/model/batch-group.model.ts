import {Batch, BatchAsObjectOptions, BatchFromObjectOptions, BatchUtils} from "./batch.model";
import {AcquisitionLevelCodes} from "../../../referential/services/model/model.enum";

export class BatchGroup extends Batch<BatchGroup> {

  // Number of individual observed (by individual measure)
  observedIndividualCount: number;

  static fromBatch(batch: Batch): BatchGroup {
    const target = new BatchGroup();
    Object.assign(target, batch);
    // Compute observed indiv. count
    target.observedIndividualCount = BatchUtils.sumObservedIndividualCount(batch.children);
    return target;
  }

  static fromObject(source: any, opts?: BatchFromObjectOptions): BatchGroup {
    const target = new BatchGroup();
    target.fromObject(source, opts);
    return target;
  }

  constructor() {
    super();
  }

  clone(): BatchGroup {
    const target = new BatchGroup();
    target.fromObject(this.asObject());
    return target;
  }

  asObject(opts?: BatchAsObjectOptions): any {
    const target = super.asObject(opts);
    if (opts && opts.minify === true) {
      delete target.observedIndividualCount;
    }
    return target;
  }

  fromObject(source: any, opts?: BatchFromObjectOptions) {
    super.fromObject(source, opts);
    this.observedIndividualCount = source.observedIndividualCount;
  }
}

export class BatchGroupUtils {

  static fromBatchTree(catchBatch: Batch): BatchGroup[] {

    // Retrieve batch group (make sure label start with acquisition level)
    // Then convert into batch group entities
    return (catchBatch.children || [])
      .filter(s => s.label && s.label.startsWith(AcquisitionLevelCodes.SORTING_BATCH + "#"))
      // Convert to Batch Group
      .map(BatchGroup.fromBatch);
  }

  /**
   * Count only individual count with measure
   * @param batch
   */
  static computeObservedIndividualCount(batch: BatchGroup) {

    // Compute observed indiv. count
    batch.observedIndividualCount = BatchUtils.sumObservedIndividualCount(batch.children);
  }


}
