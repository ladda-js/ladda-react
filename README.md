# ladda-react

Ladda-react provides helper functions to easily integrate React apps with the data caching library [Ladda](https://github.com/ladda-js/ladda).

# Installation

    npm install --save ladda-react

# Functions

## withData(config)

`withData` is a [HOC](https://reactjs.org/docs/higher-order-components.html) that takes a configuration object and enriches an existing component by injecting state management.

### Example

    import { withData } from 'ladda-react';
    
    withData({
        resolve: {
            mails: (props) => api.getMails(props.userId), // api.getMails() returns a promise
        },
        pendingComponent: () => <LoadingComponent />,
        errorComponent: () => <ErrorComponent />,
        // ... and more! Check "Config" for more options.
    })(MyComponent)

### Config

| Key                  | Type            | Example |
| -------------------- | --------------- | ------- |
| **resolve**          | object          |         |
| **observe**          | object          |         |
| **paginate**         | object          |         |
| **pendingComponent** | React Component |         |
| **errorComponent**   | React Component |         |


# Development

    npm install
