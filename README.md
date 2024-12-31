# Usage: 

Filtered Generation: 

```bash
npx generate --filter="Type"
```

All: 


```bash
npx generate --all
```

## Release: 

### Local: 

```bash
npm run release
```
this will use release-it features and ask you questions about the version etc. 


### With Action: 

Go to: 
- actions 
- release action
- on top right side of the website you can see an input
- in the input write the releated version type and run the workflow. 

#### Setting GitHub Action: 

Here is the resources to set this again: 
- Setting self hosted runner from GitHub
- run the runner as service: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service 
- Follow the steps in this blog: https://superface.ai/blog/npm-publish-gh-actions-changelog
