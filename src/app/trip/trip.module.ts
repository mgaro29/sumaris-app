import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from '../core/core.module';
import { TripsPage } from './trips.page';
import { TripPage } from './trip.page';
import { TripForm } from './trip.form';
import { SaleForm } from './sale/sale.form';
import { OperationForm } from './operation/operation.form';
import { OperationPage } from './operation/operation.page';
import { MeasurementsForm } from './measurement/measurements.form.component';
import { MeasurementQVFormField } from './measurement/measurement-qv.form-field.component';
import { MeasurementFormField } from './measurement/measurement.form-field.component';
import { CatchForm } from './catch/catch.form';
import { PhysicalGearForm } from './physicalgear/physicalgear.form';
import { PhysicalGearTable } from './physicalgear/physicalgears.table';
import { OperationTable } from './operation/operations.table';
import { TripModal } from './trip.modal';
import { SamplesTable } from './sample/samples.table';
import { SubSamplesTable } from './sample/sub-samples.table';
import { BatchGroupsTable } from './batch/batch-groups.table';
import { BatchesTable } from './batch/batches.table';
import { SubBatchesTable } from './batch/sub-batches.table';
import { IndividualMonitoringTable } from './sample/individualmonitoring/sample-individual-monitoring.table';
import { MeasurementValuesForm } from './measurement/measurement-values.form.class';
import { EntityQualityMetadataComponent} from "./quality/entity-quality-metadata.component";

import { TripService, OperationService } from './services/trip.services';

import {
    TripValidatorService, SaleValidatorService, PhysicalGearValidatorService, OperationValidatorService, PositionValidatorService,
    MeasurementsValidatorService, BatchValidatorService, BatchGroupsValidatorService, SampleValidatorService,
    SubSampleValidatorService, SubBatchValidatorService
} from './services/trip.validators';

export { TripsPage, TripPage, MeasurementValuesForm }

@NgModule({
    imports: [
        CommonModule,
        CoreModule
    ],

    declarations: [
        TripsPage,
        TripPage,
        TripForm,
        TripModal,
        SaleForm,
        PhysicalGearForm,
        PhysicalGearTable,
        OperationForm,
        OperationPage,
        OperationTable,
        MeasurementsForm,
        MeasurementQVFormField,
        MeasurementFormField,
        CatchForm,
        SamplesTable,
        SubSamplesTable,
        BatchGroupsTable,
        BatchesTable,
        SubBatchesTable,
        IndividualMonitoringTable,
        EntityQualityMetadataComponent
    ],
    exports: [
        TripsPage,
        TripPage,
        TripForm,
        TripModal,
        SaleForm,
        PhysicalGearForm,
        PhysicalGearTable,
        OperationForm,
        OperationPage,
        OperationTable,
        MeasurementsForm,
        MeasurementQVFormField
    ],
    entryComponents: [
        TripsPage,
        TripPage,
        TripModal,
        PhysicalGearTable,
        OperationTable,
        OperationPage,
        MeasurementsForm,
        MeasurementQVFormField,
        MeasurementFormField
    ],
    providers: [
        TripService,
        TripValidatorService,
        SaleValidatorService,
        PhysicalGearValidatorService,
        OperationService,
        OperationValidatorService,
        PositionValidatorService,
        MeasurementsValidatorService,
        BatchValidatorService,
        SubBatchValidatorService,
        BatchGroupsValidatorService,
        SampleValidatorService,
        SubSampleValidatorService
    ]
})
export class TripModule {
}
