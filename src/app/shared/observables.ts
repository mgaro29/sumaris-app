import {BehaviorSubject, Observable, Subject} from "rxjs";
import {catchError, filter, first, tap} from "rxjs/operators";
import {isNotNil} from "./functions";


export function filterNotNil<T = any>(obs: Observable<T>): Observable<T> {
  return obs.pipe(filter(isNotNil));
}
export function firstNotNil<T = any>(obs: Observable<T>): Observable<T> {
  return obs.pipe(first(isNotNil));
}
export function filterTrue<boolean>(obs: Observable<boolean>): Observable<boolean> {
  return obs.pipe(filter((v) => v === true));
}
export function filterFalse<boolean>(obs: Observable<boolean>): Observable<boolean> {
  return obs.pipe(filter((v) => v === false));
}
export function firstTruePromise<boolean>(obs: Observable<boolean>): Promise<boolean> {
  return obs.pipe(first((v) => v === true)).toPromise();
}
export function firstFalsePromise<boolean>(obs: Observable<boolean>): Promise<boolean> {
  return obs.pipe(first((v) => v === false)).toPromise();
}
export function firstNotNilPromise<T = any>(obs: Observable<T>): Promise<T> {
  return firstNotNil(obs).toPromise();
}
export function concatPromises<T = any>(jobFactories: (() => Promise<any>)[]): Promise<T[]> {
  return (jobFactories||[]).reduce((previous: Promise<any> | null, jobFactory) => {
    // First job
    if (!previous) {
      return jobFactory()
        // Init the final result array, with the first result
        .then(jobRes => [jobRes]);
    }
    // Other jobs
    return previous
      .then((finalResult) => jobFactory()
        // Add job result to final result array
        .then(jobRes => finalResult.concat(jobRes)));
  }, null);
}
