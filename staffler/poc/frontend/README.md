# Staffler

## Local setup

Before runnning project locally, you will need to set registry and login for external paid Bryntum library that we use.

Execute these with credentials below:

```
npm config set "@bryntum:registry=https://npm.bryntum.com" &&
npm login --registry=https://npm.bryntum.com
```

Username: `development..boemm.eu`

Password: `JvvlSIC5YoMIY9s9JCV2RcQ3`

Now you can do `npm i`

## Envs

dev -> [dev.my.jobfixers.be](https://dev.dps.boemm.eu)

qa -> [qa.my.jobfixers.be](https://qa.dps.boemm.eu)

prod -> [myplanning.digitalpayrollservices.be](https://myplanning.digitalpayrollservices.be)

## API Swagger documentation

(BOEMM VPN required)

http://boemm-nlb-dev-d79bf2e45c1cad91.elb.eu-central-1.amazonaws.com:8103/dps-api/swagger-ui/index.html

## To do/Tech debt

- [ ] Upgrade to Angular v20
- [ ] Replace custom [auth store](src/app/core/store/auth.store.ts) with [NGxs Auth](https://www.ngxs.io/recipes/authentication).
- [ ] Replace Rollbar with Sentry or other more usefull error monitoring tools
- [ ] Get rid of `fantasticon` font generator, use SVGs.
