import * as React from 'react'
import Observable from '../../retrievers/Observable';
import Loader, {ConfigMap as LoaderConfigMap, RenderProps} from './loader'
import Page from '../../retrievers/Page';
import Cursor from '../../retrievers/Cursor';
import Response from '../../retrievers/Response';

interface ContainerProps<TypeMap, OP extends InjectedResults<TypeMap>> {
    externalProps: ExternalProps<TypeMap, OP>
    config: ConfigMap<TypeMap, ExternalProps<TypeMap, OP>>
    component: React.ComponentType<OP>
}

type ExternalProps<TypeMap, OP extends InjectedResults<TypeMap>> = Omit<OP, keyof ConfigMap<TypeMap, OP>>

type InjectedResults<TypeMap> = {[key in keyof TypeMap]:TypeMap[key]}

interface State {

}

class Container<TypeMap, OP extends InjectedResults<TypeMap>> extends React.PureComponent<ContainerProps<TypeMap, OP>, State> {
    // TODO cache the augmented config

    render() {
        const Component = this.props.component
        // We need to make sure Loader and Container are using the same TypeMap
        const LLoader = Loader.of<TypeMap>()
        return <LLoader config={this.augmentConfig()}>
            {(props:RenderProps<TypeMap>) => <Component {...this.props.externalProps} {...props}/>}
        </LLoader>
    }

    augmentConfig() {
        type EP = ExternalProps<TypeMap, OP>
        const loaderConfig:LoaderConfigMap<TypeMap> = {} as any
        for (const key in this.props.config) {
            type T = TypeMap[typeof key]
            const config:Config<EP, T> = this.props.config[key]
            if ('resolve' in config) {
                loaderConfig[key] = {
                    resolve: () => config.resolve(this.props.externalProps)
                }
            } else if ('observe' in config) {
                loaderConfig[key] = {
                    observe: () => config.observe(this.props.externalProps)
                }
            } else if ('poll' in config) {
                loaderConfig[key] = {
                    poll: () => config.poll(this.props.externalProps),
                    interval: config.interval
                }
            } else if ('resolvePage' in config) {
                loaderConfig[key] = {
                    resolvePage: (page:Page) => config.resolvePage(this.props.externalProps, page),
                    getNextPage: () => config.getNextPage(this.props.externalProps)
                }
            } else if ('observePage' in config) {
                loaderConfig[key] = {
                    observePage: (page: Page) => config.observePage(this.props.externalProps, page),
                    getNextPage: (page?: Page) => config.getNextPage(this.props.externalProps, page)
                }
            } else if ('resolveCursor' in config) {
                loaderConfig[key] = {
                    resolveCursor: (cursor:Cursor) => config.resolveCursor(this.props.externalProps, cursor),
                    startingCursor: config.startingCursor
                }
            }
        }
        return loaderConfig
    }
}


interface ResolveConfig<EP, T> {
    resolve: (props:EP) => Promise<T>
}

interface ObserveConfig<EP, T> {
    observe: (props: EP) => Observable<T>
}

interface PollConfig<EP, T> {
    poll: (props: EP) => Promise<T>
    interval: number
}

export interface ResolvePageConfig<EP, T> {
    resolvePage: (props: EP, page: Page) => Promise<T>
    getNextPage: (props:EP, page?: Page) => Page
}

export interface ObservePageConfig<EP, T> {
    observePage: (props: EP, page: Page) => Observable<T>
    getNextPage: (props: EP, page?: Page) => Page
}

export interface CursorConfig<EP, T> {
    resolveCursor: (props: EP, cursor: Cursor) => Promise<Response<T>>
    startingCursor: Cursor
}


type Config<EP, T> = ResolveConfig<EP, T> 
                   | ObserveConfig<EP, T>
                   | PollConfig<EP, T>
                   | ResolvePageConfig<EP, T>
                   | ObservePageConfig<EP, T>
                   | CursorConfig<EP, T>

type ConfigMap<TypeMap, EP> = {
    [name in keyof TypeMap]: Config<EP, TypeMap[name]>
}

function withData<TypeMap, OP extends InjectedResults<TypeMap>>(config:ConfigMap<TypeMap, ExternalProps<TypeMap, OP>>) {
    return function decorate(component:React.ComponentType<OP>) {

        return class ComponentWithData extends React.PureComponent<ExternalProps<TypeMap, OP>> {
            render() {
                return React.createElement<ContainerProps<TypeMap, OP>>(Container, {
                    externalProps: this.props,
                    config,
                    component
                })
            }
        }

    }
}

//https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-307871458
type Diff<T extends string, U extends string> = ({ [P in T]: P } & { [P in U]: never } & { [x: string]: never })[T];
type Omit<T, K extends keyof T> = { [P in Diff<keyof T, K>]: T[P] };
type Overwrite<T, U> = { [P in Diff<keyof T, keyof U>]: T[P] } & U;