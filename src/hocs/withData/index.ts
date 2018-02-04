import { createElement, Component } from 'react';

/*

export default withData({
    resolve: {
        logs: ({ companyId, query }, cursor) => getLogs({ companyId, ...query, cursor, limit: 50 }),
    },
    paginate: {
        logs: {
            ...withData.PAGINATION.PRESET.infiniteCursor(null),
            getCursor: r => r.cursor,
            reduceResults: (mem, r) => ({ ...mem, results: mem.results.concat(r.results), cursor: r.cursor }),
        },
    },
    pendingComponent: () => <LoadingContentIndicator />,
})(AuditLogList);

*/

interface PagerConfig {
  mode: PaginationMode
  type: PaginationType
}

type PaginationType = "offsetAndLimit" | "cursor"
type PaginationMode = "infinite"

interface PagerConfigCursor<T> extends PagerConfig {
  startingCursor: Cursor
  getCursor(response:Response<T>):Cursor
  reduceResults(mem:Response<T>, r:Response<T>):Response<T>
}

interface Reducible {
  reduce(mem:this, e:this):this
}

function isKeyOf<Map, OP>(props:Config<Map, OP>, key:string):key is keyof Map {
  return key in props.resolve || key in props.observe || key in props.poll
}

interface Response<T> extends Reducible{
  results: T
  cursor:Cursor
}

interface Cursor {

}

interface PagerConfigOffset<T> extends PagerConfig {
  getNextPage(prevPager:Pager):Pager
}

interface Pager {
  limit: number
  offset: number
}

const PAGINATION = {
  TYPE: {
    OFFSET_AND_LIMIT: 'offsetAndLimit',
    CURSOR: 'cursor'
  },
  MODE: {
    INFINITE: 'infinite'
  },
  PRESET: {
    infiniteOffsetAndLimit: <T>(initialSize:number, nextSize = initialSize):PagerConfigOffset<T> => ({
      type: PAGINATION.TYPE.OFFSET_AND_LIMIT as 'offsetAndLimit',
      mode: PAGINATION.MODE.INFINITE as 'infinite',
      getNextPage: ({ limit, offset }:Pager) => {
        if (offset === null) {
          return { offset: 0, limit: initialSize };
        }
        return { offset: offset + limit, limit: nextSize };
      }
    }),
    infiniteCursor: <T>(startingCursor:Cursor):PagerConfigCursor<T> => ({
      type: PAGINATION.TYPE.CURSOR as 'cursor',
      mode: PAGINATION.MODE.INFINITE as 'infinite',
      startingCursor,
      getCursor: (r) => r.cursor,
      reduceResults: (mem, r) => ({ ...mem, results: mem.results.concat(r.results), cursor: r.cursor }),
    })
  }
};

const every = <T>(predicate:(e:T)=>boolean, collection:T[]) => {
  for (let i = 0; i < collection.length; i++) {
    if (!predicate(collection[i])) {
      return false;
    }
  }
  return true;
};

const any = <T>(predicate:(e:T)=>boolean, collection:T[]) => {
  for (let i = 0; i < collection.length; i++) {
    if (predicate(collection[i])) {
      return true;
    }
  }
  return false;
};


interface RetrieverConfig<T, OP> {
  name: string;
  getProps: ()=>OP;
  publishData: (data:T)=>void;
  publishError: (error:Error)=>void;
}

abstract class Retriever<T, OP> {
  name: string;
  getProps: ()=>OP;
  publishData: (data:T)=>void;
  publishError: (error:Error)=>void;

  constructor({ name, getProps, publishData, publishError }:RetrieverConfig<T, OP>) {
    this.name = name;
    this.getProps = getProps;
    this.publishData = publishData;
    this.publishError = publishError;
  }

  abstract get():Promise<void> 

  // eslint-disable-next-line class-methods-use-this
  mergeProps(props:ContainerProps<T, OP>) {
    return props;
  }

  // eslint-disable-next-line class-methods-use-this
  onDestroy() {}
}

interface ResolveRetrieverConfig<T, Props> extends RetrieverConfig<T, Props> {
  getter(props:Props):Promise<T>
}

class ResolveRetriever<T, Props> extends Retriever<T, Props> {
  type = 'resolve';

  getter: (props:Props) => Promise<T>;

  constructor(args:ResolveRetrieverConfig<T, Props>) {
    super(args);
    this.getter = args.getter;
  }

  get(): Promise<void> {
    const promise = this.getter(this.getProps());
    if (!promise || !promise.then) {
      throw new Error(`${this.type} for ${this.name} did not return a promise!`);
    }
    return promise.then(this.publishData, this.publishError);
  }
}

interface PollRetrieverConfig<T, Props> extends ResolveRetrieverConfig<T, Props> {
  interval?: number
}

class PollRetriever<T, Props> extends ResolveRetriever<T, Props> {
  type = 'poll';
  interval: number | null;

  constructor(args:PollRetrieverConfig<T, Props>) {
    super(args);
    this.interval = args.interval ? setInterval(() => this.get(), args.interval) : null;
  }

  onDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

interface Observable<T> {
  subscribe(publishHandler: (data:T)=>void, errorHandler: (error:Error)=>void):Subscription
}

interface Subscription {
  unsubscribe():void
}

interface ObserveRetrieverConfig<T, OP> extends RetrieverConfig<T, OP> {
  getter(props:OP):Observable<T>
}

class ObserveRetriever<T, OP> extends Retriever<T, OP> {
  type = 'observe'
  subscription: null | Subscription
  getter: (props:OP) => Observable<T>

  constructor(args:ObserveRetrieverConfig<T, OP>) {
    super(args);
    this.getter = args.getter;
    this.subscription = null;
  }

  get() {
    const observable:Observable<T>|null = this.getter(this.getProps());
    if (!observable || !observable.subscribe) {
      throw new Error(`${this.type} for ${this.name} did not expose a subscribe function`);
    }
    this.subscription = observable.subscribe(this.publishData, this.publishError);
    return Promise.resolve();
  }

  onDestroy() {
    if (this.subscription && this.subscription.unsubscribe) {
      this.subscription.unsubscribe();
    }
  }
}

const mergePaginateProps = <Map, OP>(props:ContainerProps<Map, OP>, name:keyof Map, pagerConfig:PagerConfig):ContainerProps<Map, OP> => ({
  ...props,
  paginate: {
    ...props.paginate as any,
    [name]: pagerConfig
  }
});

interface PaginatedInfiniteCursorRetrieverConfig<T, OP> extends RetrieverConfig<T, OP> {
  pagerConfig: PagerConfigCursor<T>
  getter: (props:OP, cursor: Cursor|null) => Promise<Response<T>>
}

class PaginatedInfiniteCursorRetriever<T, OP> extends Retriever<T, OP> {
  type = 'resolve with cursor'
  pagerConfig: PagerConfigCursor<T>
  pastCursors: Cursor[] = []
  nextCursor: Cursor
  hasNext: boolean = true
  pending: null | Promise<void> = null
  getter: (props:OP, cursor: Cursor|null) => Promise<Response<T>>

  constructor(args:PaginatedInfiniteCursorRetrieverConfig<T, OP>) {
    super(args);
    this.pagerConfig = args.pagerConfig;
    this.getter = args.getter
    this.nextCursor  = args.pagerConfig.startingCursor || null;
  }

  get() {
    if (this.pending) {
      return this.pending;
    }

    const props = this.getProps();

    this.pending = Promise.all([
      ...this.pastCursors.map((cursor) => this.getter(props, cursor)),
      this.getter(props, this.nextCursor).then(response => {
        const nextCursor = this.pagerConfig.getCursor(response);

        this.pastCursors.push(this.nextCursor);
        this.nextCursor = nextCursor;
        this.hasNext = !!nextCursor;
        this.pending = null;

        return response;
      })
    ]).then((results) => this.publishData(results.reduce(this.pagerConfig.reduceResults).results));

    this.pending.catch((err) => {
      this.pending = null;
      return Promise.reject(err);
    });

    return this.pending;
  }

  mergeProps<Map>(props:ContainerProps<Map, OP>) {
    if (!isKeyOf(props, this.name)) throw new Error('Name is not a key in paginate config')
    const pagerConfig:PagerConfigCursor<T> = {
      getNext: () => this.get(),
      hasNext: this.hasNext
    }
    return mergePaginateProps(props, this.name, pagerConfig);
  }
}

interface PaginatedInfiniteOffsetAndLimitResolveRetrieverConfig<T, OP> extends RetrieverConfig<T, OP> {
  getter: (props:OP, pager:Pager) => Promise<T>
  pagerConfig: PagerConfigOffset<T>
}

class PaginatedInfiniteOffsetAndLimitResolveRetriever<T, OP> extends Retriever<T, OP> {
  type = 'resolve paginated'
  pagerConfig:PagerConfigOffset<T>
  pagers: Pager[] = [];
  getter: (props:OP, pager:Pager) => Promise<T>

  constructor(args:PaginatedInfiniteOffsetAndLimitResolveRetrieverConfig<T, OP>) {
    super(args);
    this.getter = args.getter
    this.pagerConfig = args.pagerConfig;
    this.queueNext();
  }

  get() {
    const props = this.getProps();
    return Promise.all(this.pagers.map((pager) => this.getter(props, pager))).then(
      (lists) => this.publishData(lists.reduce((mem, list) => [...mem, ...list])),
      (err) => Promise.reject(err)
    );
  }

  queueNext() {
    const prevPager = this.pagers[this.pagers.length - 1] || { limit: null, offset: null };
    const nextPager = this.pagerConfig.getNextPage(prevPager);
    this.pagers.push(nextPager);
  }

  mergeProps<Map>(props:ContainerProps<Map, OP>) {
    if (!isKeyOf(props, this.name)) throw new Error('Name is not a key in paginate config')
    const pagerConfig:PagerConfigOffset<T> = {
      getNext: () => {
        this.queueNext();
        return this.get();
      }
    }
    return mergePaginateProps(props, this.name, pagerConfig);
  }
}

interface PagerSubscription<T> {
  subscription: null|Subscription
  firstLoad?: boolean
  pager: Pager
  data: null | T
  error: null | Error
}

interface PaginatedInfiniteOffsetAndLimitObserveRetrieverConfig<T, OP> extends RetrieverConfig<T, OP> {
  pagerConfig: PagerConfigOffset<T>
  getter: (props:OP, pager:Pager)=>Observable<T>
}

class PaginatedInfiniteOffsetAndLimitObserveRetriever<T extends any[], OP> extends Retriever<T, OP> {
  type = 'observe paginated'
  pagerConfig: PagerConfigOffset<T>
  pagerSubscriptions: PagerSubscription<T>[] = []
  getter: (props:OP, pager:Pager)=>Observable<T>

  constructor(args:PaginatedInfiniteOffsetAndLimitObserveRetrieverConfig<T, OP>) {
    super(args);
    this.getter = args.getter
    this.pagerConfig = args.pagerConfig;
    this.queueNext();
  }

  get():Promise<void> {
    const props = this.getProps();
    return new Promise((resolve) => {
      const tryResolve = (d:T) => {
        if (every(p_ => !!p_.data, this.pagerSubscriptions)) {
          resolve(d);
        }
      };
      this.pagerSubscriptions = this.pagerSubscriptions.map((p) => {
        // TODO wenn dieser PAger schon eine subscription hat, wird für ihn auch nie die PRomise aufgelöst
        if (!p.subscription) {
          p.firstLoad = true;
          p.subscription = this.getter(props, p.pager).subscribe(
            (data) => {
              p.data = data;
              p.firstLoad = false;
              this.tryToPublish();
              tryResolve(data);
            },
            this.publishError
          );
        }
        return p;
      });
    });
  }

  queueNext() {
    const pagers = this.pagerSubscriptions.map((p) => p.pager);
    const prevPager = pagers[pagers.length - 1] || { limit: null, offset: null };
    const nextPager = this.pagerConfig.getNextPage(prevPager);
    const p:PagerSubscription<T> = {
      pager: nextPager,
      subscription: null,
      data: null,
      error: null
    };
    this.pagerSubscriptions.push(p);
  }

  tryToPublish() {
    const result:T = [] as any;
    for (let i = 0; i < this.pagerSubscriptions.length; i++) {
      const p = this.pagerSubscriptions[i];
      if (!p.data) {
        return;
      }
      result.push(...p.data);
    }
    this.publishData(result);
  }

  mergeProps<Map>(props:ContainerProps<Map, OP>) {
    if (!isKeyOf(props, this.name)) throw new Error('Name is not a key in paginate config')
    const pagerConfig:PagerConfigOffset<T> = {
      getNext: () => {
        this.queueNext();
        return this.get();
      },
      isLoading: any(p => !p.data, this.pagerSubscriptions)
    }
    return mergePaginateProps(props, this.name, pagerConfig);
  }

  onDestroy() {
    this.pagerSubscriptions.forEach((p) => {
      if (p.subscription && p.subscription.unsubscribe) {
        p.subscription.unsubscribe();
      }
    });
  }
}

const isInfiniteOffsetAndLimitPager = <T>(pagerConfig:PagerConfig):pagerConfig is PagerConfigOffset<T> => {
  // TODO here use more robust typechecking (discriminate union on pagerConfig.type)
  return pagerConfig.mode === PAGINATION.MODE.INFINITE && pagerConfig.type === PAGINATION.TYPE.OFFSET_AND_LIMIT;
};

const isInfiniteCursor = <T>(pagerConfig:PagerConfig):pagerConfig is PagerConfigCursor<T> => {
  return pagerConfig.mode === PAGINATION.MODE.INFINITE && pagerConfig.type === PAGINATION.TYPE.CURSOR;
};

const getResolveRetriever = (pagerConfig:PagerConfig) => {
  if (pagerConfig) {
    if (isInfiniteOffsetAndLimitPager(pagerConfig)) {
      return PaginatedInfiniteOffsetAndLimitResolveRetriever;
    }

    if (isInfiniteCursor(pagerConfig)) {
      return PaginatedInfiniteCursorRetriever;
    }
  }
  return ResolveRetriever;
};

const getObserveRetriever = (pagerConfig:PagerConfig) => {
  if (pagerConfig) {
    if (isInfiniteOffsetAndLimitPager(pagerConfig)) {
      return PaginatedInfiniteOffsetAndLimitObserveRetriever;
    }
  }
  return ObserveRetriever;
};

interface Config<Map, OP> {
  resolve: {[key in keyof Map]: (props:OP, pager?:Pager|Cursor|null) => Promise<Map[key]>}
  observe: {[key in keyof Map]: (props:OP) => Observable<Map[key]>}
  poll: {[key in keyof Map]: (props:OP) => Promise<Map[key]>}
  paginate: {[key in keyof Map]: PagerConfig | undefined}
}

interface ContainerProps<Map, OP> extends Config<Map, OP>{
  originalProps: OP
}

interface ContainerState<Map> {
  pending: boolean,
  error: null|Error,
  resolvedProps: null | {[key in keyof Map]: Map[key]}
}

class Container<Map, OP> extends Component<ContainerProps<Map, OP>, ContainerState<Map>> {
  resolvedData: {[key in keyof Map]?: Map[key]}
  resolvedDataTargetSize: number
  retrievers: {[key in keyof Map]?: Retriever<Map[key], OP>};
  subscriptions: Subscription[]
  pagers: {[name: string]: Pager}

  constructor(props:ContainerProps<Map, OP>) {
    super(props);

    this.resolvedData = {};
    this.resolvedDataTargetSize = 0;

    this.retrievers = {};

    this.subscriptions = [];
    this.pagers = {};

    this.state = {
      pending: false,
      error: null,
      resolvedProps: null
    };
  }

  destroy() {
    for(const key in this.retrievers) {
      this.retrievers[key]!.onDestroy();
      delete this.retrievers[key];
    }
  }

  componentWillMount() {
    this.setupRetrievers(this.props);
    this.trigger();
  }

  componentWillReceiveProps(newProps:ContainerProps<Map, OP>) {
    this.destroy();
    this.setupRetrievers(newProps);
    this.trigger();
  }

  componentWillUnmount() {
    this.destroy();
  }

  addResolvedData<K extends keyof Map,D extends Map[K]>(field:keyof Map, data:D) {
    this.resolvedData[field] = data;
    if (this.resolvedDataTargetSize === Object.keys(this.resolvedData).length) {
      this.setState({
        pending: false,
        resolvedProps: { ...this.resolvedData as any },
        error: null
      });
    }
  }

  setError(field:string, error:Error) {
    this.setState({ pending: false, error });
  }

  setupRetrievers(props:ContainerProps<Map, OP>) {
    const paginate = props.paginate || {}
    const resolve = props.resolve || {}
    const observe = props.observe || {}
    const poll    = props.poll || {} 
    const originalProps = props.originalProps

    const observeKeys = Object.keys(observe);
    const pollKeys = Object.keys(poll);

    const getProps = () => originalProps;
    const publishData = <K extends keyof Map, D extends Map[K]>(key:K) => (data:D) => this.addResolvedData(key, data);
    const publishError = (key:keyof Map) => (err:Error) => this.setError(key, err);

    for (const key in resolve) {
      const pagerConfig = paginate[key];
      type T = Map[typeof key]
      if (pagerConfig && isInfiniteOffsetAndLimitPager<T>(pagerConfig)) {
        this.retrievers[key] = new PaginatedInfiniteOffsetAndLimitResolveRetriever<T, OP>({
          name: key,
          publishData: publishData(key),
          publishError: publishError(key),
          getProps,
          getter: resolve[key],
          pagerConfig
        })
      } else if (pagerConfig && isInfiniteCursor(pagerConfig)){
        this.retrievers[key] = new PaginatedInfiniteCursorRetriever({
          name: key,
          publishData: publishData(key),
          publishError: publishError(key),
          getProps,
          getter: resolve[key],
          pagerConfig
        })
      } else {
        this.retrievers[key] = new ResolveRetriever({
          name: key,
          publishData: publishData(key),
          publishError: publishError(key),
          getProps,
          getter: resolve[key],
        })
      }
    };

    observeKeys.forEach((key) => {
      const pagerConfig = paginate[key];
      const Constructor = getObserveRetriever(pagerConfig);
      this.retrievers[key] = new Constructor({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter: observe[key],
        pagerConfig
      });
    });

    pollKeys.forEach((key) => {
      const getter = poll[key].resolve;
      const interval = (poll[key].interval || (() => null))(originalProps);
      this.retrievers[key] = new PollRetriever({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter,
        interval
      });
    });

    this.resolvedDataTargetSize = resolveKeys.length + observeKeys.length + pollKeys.length;
  }

  trigger() {
    this.setState({ pending: true, error: null });

    Object.keys(this.retrievers).forEach((key) => {
      this.retrievers[key].get();
    });
  }

  render() {
    const { pending, error, resolvedProps } = this.state;
    const { originalProps, errorComponent, pendingComponent, component } = this.props;

    if (pending) {
      return pendingComponent ? createElement(pendingComponent, originalProps) : null;
    }

    if (error) {
      return errorComponent ? createElement(errorComponent, { ...originalProps, error }) : null;
    }

    const nextProps = Object.keys(this.retrievers).reduce(
      (props, key) => this.retrievers[key].mergeProps(props),
      { ...originalProps, ...resolvedProps }
    );
    return createElement(component, nextProps);
  }
}

export function withData<T, OP>(conf:Config<T, OP>) {
  return component => {
    // make it pure again
    return (originalProps:OP) => {
      const props = { ...conf, originalProps, component };
      return createElement(Container, props);
    };
  };
}

withData.PAGINATION = PAGINATION;

