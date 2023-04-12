# Limerickbot

## Tagging limerickbot in bluesky

If you tag @limerickbot.gar.lol in a reply to a post on Bluesky, the bot will
respond, turning the parent post into a limerick.

Currently, the bot only responds to mentions which are replies to other posts.
If you tag @limerickbot.gar.lol in a top-level post, currently nothing happens.

----

## For devs (mostly me)

### Run the script locally
```
node index.js
```

### Create a zipfile of the script (in xonsh)
```
![zip -rq function.zip .]
```

### Update the lambda function with the zipfile
```
aws lambda update-function-code --function-name limerickbot_run --zip-file fileb://function.zip > /dev/null
```

### Invoke the lambda function manually and view the log
```
aws lambda invoke --function-name limerickbot_run out --log-type Tail --query 'LogResult' --output text |  base64 -d
```
