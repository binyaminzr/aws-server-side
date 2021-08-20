var port = process.env.PORT || 8080;
var express = require('express');
var cors = require('cors');
var app = express();
var AWS = require("aws-sdk");
var bodyParser = require('body-parser');
const multer = require('multer');
const multerS3 = require('multer-s3');


AWS.config.update({
    "region": "us-east-1",
    "accessKeyId": "AKIARFVBAORHCHN6MH5M",
    "secretAccessKey": "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"
});


app.use(cors()); // support cross origin calls to api
app.use(bodyParser.json()); // support JSON-encoded bodies for post

// test: curl "localhost:8080/getitem?filename=chilkibilki&user=lior"
app.get('/getitem', function (req, res) {
    var docClient = new AWS.DynamoDB.DocumentClient();
    var table = "files";
    var file_name = req.query.filename;//"chilkibilki";
    var user = req.query.user;//"uri";
    console.log("file " + file_name + " user " + user);
    var params = {
        TableName: table,
        Key: {
            "file_name": file_name,
            "user": user
        }
    };

    docClient.get(params, function (err, data) {
        if (err) {
            handleError(err, res);
        } else {
            handleSuccess(data.Item, res);
        }
    });
});

//curl -X POST -H 'content-type:application/json' -d '{"file_name":"value1", "user":"value2"}' localhost:8080/setitem 
app.post('/setitem', function (req, res) {
    var dynamo = new AWS.DynamoDB();
    var request = {
        file_name: req.body.file_name,
        user: req.body.user
    };

    var params = {
        Item: {
            "file_name": {
                S: request.file_name
            },
            "user": {
                S: request.user
            },
            "lucky_meter": {
                S: "very lucky"
            },
            "lucky_love": {
                S: "very lucky"
            }
        },
        TableName: "files"
    };

    dynamo.putItem(params, function (err, data) {
        if (err)
            handleError(err, res);
        //console.log(err, err.stack); // an error occurred
        else
            handleSuccess(data, res);// successful response
    });
});

// curl -X POST localhost:8080/upload
app.post('/upload', function (req, res) {
    var fs = require('fs');
    var data_stream = fs.createReadStream(req.body.filename);
    var s3 = new AWS.S3({ params: { Bucket: 'lior-upload-bucket', Key: req.body.filename + Date.now() } });
    s3.putObject({ Body: data_stream }, function (err, data) {
        if (err)
            handleError(err, res);
        else
            handleSuccess(data, res);
    });
});


//curl -X POST -H 'content-type:application/json' -d '{"picName":"50 Cent.jpg"}' localhost:8080/getItem 
app.post('/getItem', function (req, res) {
    var s3 = new AWS.S3();
   s3.getObject(
  { Bucket: "aws-saved-photos-lior", Key: req.body.picName},
  function (error, data) {
    if (error != null) {
      console.log("Failed to retrieve an object: " + error);
    } else {
        res.send(data);
      // do something with data.Body
    }
  }
);
});

var picture;
// upload file to s3 using the angular app
var upload = multer({
    storage: multerS3({
        acl: 'public-read',
        s3: new AWS.S3(),
        bucket: 'lior-upload-bucket',
        key: function (req, file, cb) {
            console.log('file to upload: ' + file.originalname);
            picture = Date.now() + file.originalname;
            // in order not to overwrite other users files that have the same name 
            cb(null, picture);
        }
    })
});

var picData = {};
var rekData = [];

// this will upload a file from the angular app
app.post('/upload-ng', upload.array('file', 1), function (req, res) {
    picData = [];
    rekData = [];
    listAllKeys();

    setTimeout(function () {
        var result;
        if (rekData.name) {

            result = {
                imageName: rekData.name, similarity: rekData.similarity, Detention_period: picData.Item.Detention_period, date_of_birth: picData.Item.date_of_birth,
                name: picData.Item.name, Year_of_detention: picData.Item.Year_of_detention, Reason_of_detention: picData.Item.Reason_of_detention
            };
            console.log(result);
            res.send(result);
        }
        else {
            result = { name: "doesn't exists" };
            res.send(result);
        }

    }, 1000);

});


var s3 = new AWS.S3();
var allKeys = [];

// load the data about the saved photos for comparing
function listAllKeys(token, cb) {
    var opts = { Bucket: "aws-saved-photos-lior" };
    if (token) opts.ContinuationToken = token;

    s3.listObjectsV2(opts, function (err, data) {
        allKeys = allKeys.concat(data.Contents);

        if (err)
            console.log(err, err.stack); // an error occurred
        else
            useRecognitaion();

    });
}



//compare faces from the saved photos and the new picture
function useRecognitaion() {
    var rekognition = new AWS.Rekognition();

    allKeys.forEach(image => {
        const params2 = {
            SourceImage: {
                S3Object: {
                    Bucket: "aws-saved-photos-lior",
                    Name: image.Key
                },
            },
            TargetImage: {
                S3Object: {
                    Bucket: "lior-upload-bucket",
                    Name: picture
                },
            },
            SimilarityThreshold: 90
        };
        rekognition.compareFaces(params2, function (err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
            }
            //while the function found match
            else if (data.FaceMatches != 0) {
                rekData = { name: image.Key, similarity: data.FaceMatches[0].Similarity };
                getData();
            }
        });
    });
}


function getData() {
    var docClient = new AWS.DynamoDB.DocumentClient();
    var table = "celebs";
    var celebPhoto = rekData.name;
    var params = {
        TableName: table,
        Key: {
            "celebPhoto": celebPhoto,
        }
    };

    docClient.get(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
        } else {
            picData = data;
            return;
        }
    });
}




app.post('/', function (req, res) {
    res.send({
        "Output": "Hello World!"
    });
});

// handle success and error for replies  
function handleError(err, res) {
    res.json({
        'message': 'server side error', statusCode: 500, error:
            err
    });

}

function handleSuccess(data, res) {
    res.json({ message: 'success', statusCode: 200, data: data });
}


app.listen(port);
module.exports = app;