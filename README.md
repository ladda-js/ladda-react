# ladda-react

Ladda-react provides helper functions to easily integrate React apps with the data caching library [Ladda](https://github.com/ladda-js/ladda).

# Installation

    npm install --save ladda-react

# Higher-Order Components

## withData(config)

`withData` is a [HOC](https://reactjs.org/docs/higher-order-components.html) that takes a configuration object and enriches an existing component by injecting state management.

### Example

```jsx
import { withData } from 'ladda-react';

const config = {
    resolve: {
        mails: (props) => api.getMails(props.userId), // api.getMails() returns a promise
    },
    pendingComponent: () => <LoadingComponent />,
    errorComponent: () => <ErrorComponent />
    // ... and more! Check "Config" for more options.
};

return withData(config)(MyComponent);
// => MyComponent will have `userId` and `mails` available as props.
```

### Config

| Key                  | Type            |
| -------------------- | --------------- |
| **observe**          | object          |
| **resolve**          | object          |
| **paginate**         | object          |
| **poll**             | object          |
| **pendingComponent** | React Component |
| **errorComponent**   | React Component |

_More details to follow._

# Development

    npm install
