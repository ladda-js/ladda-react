export default interface Observable<T> {
    subscribe(publishHandler: (data:T)=>void, errorHandler: (error:Error)=>void):Subscription
}

export interface Subscription {
    unsubscribe():void
}
