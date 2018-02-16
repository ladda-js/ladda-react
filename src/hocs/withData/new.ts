import * as React from 'react'
import Observable from '../../retrievers/Observable';

interface ContainerProps<TypeMap, OP extends InjectedResults<TypeMap>> {
    externalProps: ExternalProps<TypeMap, OP>
    config: ConfigMap<TypeMap, OP>
    component: React.ComponentType<OP>
}

type ExternalProps<TypeMap, OP extends InjectedResults<TypeMap>> = Omit<OP, keyof ConfigMap<TypeMap, OP>>

type InjectedResults<TypeMap> = {[key in keyof TypeMap]:TypeMap[key]}

interface State {

}

class Container<TypeMap, OP extends InjectedResults<TypeMap>> extends React.Component<ContainerProps<TypeMap, OP>, State> {
    render() {
        const generatedValues:InjectedResults<TypeMap> = {} as any;
        // This works but Typescript can't check it properly
        const props:OP = <any>Object.assign({}, generatedValues, this.props.externalProps);
        return React.createElement<OP>(this.props.component, props)
    }
}

interface ResolveConfig<OP, T> {
    resolve: (props:OP) => Promise<T>
}

interface ObserveConfig<OP, T> {
    observe: (props: OP) => Observable<T>
}

interface PollConfig<OP, T> {
    poll: (props: OP) => Promise<T>
    interval: number
}

type Config<OP, T> = ResolveConfig<OP, T> | ObserveConfig<OP, T>

type ConfigMap<TypeMap, OP> = {
    [name in keyof TypeMap]: Config<OP, TypeMap[name]>
}

function withData<TypeMap, OP extends InjectedResults<TypeMap>>(config:ConfigMap<TypeMap, OP>) {
    return (component:React.ComponentType<OP>) => {
        return class ComponentWithData extends React.PureComponent<ExternalProps<TypeMap, OP>> {
            render() {
                return React.createElement<ContainerProps<TypeMap, OP>>(Container, {
                    externalProps: this.props,
                    config,
                    component})
            }
        }
    }
}

//https://github.com/Microsoft/TypeScript/issues/12215#issuecomment-307871458
type Diff<T extends string, U extends string> = ({ [P in T]: P } & { [P in U]: never } & { [x: string]: never })[T];
type Omit<T, K extends keyof T> = { [P in Diff<keyof T, K>]: T[P] };
type Overwrite<T, U> = { [P in Diff<keyof T, keyof U>]: T[P] } & U;