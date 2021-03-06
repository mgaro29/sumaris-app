import { Pipe, Injectable, PipeTransform } from '@angular/core';
import {isMoment, Moment} from "moment/moment";
import { DateAdapter } from "@angular/material/core";
import { DATE_ISO_PATTERN } from '../constants';

@Pipe({
    name: 'dateFormat'
})
@Injectable({providedIn: 'root'})
export class DateFormatPipe implements PipeTransform {

    constructor(
        private dateAdapter: DateAdapter<Moment>) {
    }

    transform(value: string | Moment | Date, args?: any): string | Promise<string> {
        args = args || {};
        args.pattern = args.pattern || (args.time ? 'L LT' : 'L');
        // Keep original moment object, if possible (to avoid a conversion)
        const date: Moment = value && (isMoment(value) ? value : this.dateAdapter.parse(value, DATE_ISO_PATTERN));
        return date && date.format(args.pattern) || '';
    }

    format(date: Moment, displayFormat: any): string {
      return this.dateAdapter.format(date, displayFormat);
    }
}
