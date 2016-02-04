//Call to the packages

var express =      require('express');
var app =          express();
var bodyParser =   require('body-parser');
var morgan =       require('morgan');
var mongoose =     require('mongoose');
var path =         require('path');
var serveStatic =  require('serve-static');
var redis  =       require('redis');
var _    =         require('underscore');
var client =       redis.createClient();
var Schema =       mongoose.Schema;
var port = 8000;

var BookSchema = new Schema({
    title: {type:String, unique:true},
    author: {type: String},
    text: {type: String, default:''}
});


var Book = mongoose.model('Book', BookSchema);
mongoose.connect('mongodb://localhost/mycache');
app.use(bodyParser.urlencoded({ extended: true}));
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(serveStatic(path.resolve(__dirname, 'public/src')));



function findByTitleCached(Book, client, title, callback){
    client.get(title, function(err, reply){
        if(err) callback(null);
        else if (reply) //Book exists in cache
            callback(JSON.parse(reply));
        else{
            //Book doesn't exist in the cache - we need to query the main database
            Book.findOne({title:title}, function(err, doc){
                if(err || !doc) callback(null);
                else{
                    //Book found in database, sace to cache and return to client
                    client.set(title,JSON.stringify(doc), function(){
                        callback(doc);
                    });
                }
            });

        }
    });
};

function updateBookByTitle(Book, client, title, newText, callback){
    Book.findOneAndUpdate({
        title:title
    },{
        $set:{
        text:newText
    }
    }, function(err, doc){//Update the main databasse
        if(err) callback(err);
        else if(!doc) callback('Missing book');
        else{
            //Save new book version to cache
            client.set(title, JSON.stringify(doc), function(err){
                if(err) callback(err);
                else callback(null);
            });
        }
    });
};

function listCache(client,appId, callback){
   client.keys('*', function(err, result){
    if(err) callback(err);
    var text = [];
    for(var i = 0; i<result.length; i++){
        var tosplice = 'cache:'+appId;
        if(String(result[i]).slice(0,tosplice.length) == tosplice ){
            text.push(result[i]);
        }
    }
   callback(text);

   });
};


app.post('/api/book', function(req, res){
    var book = new Book({
        title:  req.body.title,
        author: req.body.author,
        text:   req.body.text
    });
    book.save(function(err, result){
        if(err)
            throw err;
        res.json({message:"Book has successfully been added."})
    });
});

app.get('/api/books', function(req, res){
    Book.find(function(err, books){
        if(err)
            throw err;
        res.json(books);
    });
});

app.get('/api/book/:title', function(req, res, next){
    findByTitleCached(Book,client, req.params.title, function(book){
        if(!book)
            res.json("server error");next();

        res.json(book);
    });
});

app.put('/api/book/:title', function(req, res){
    if(!req.params.title) res.status(400).send("Please send the book title");
    else if (!req.body.text) res.status(400).send("Please send the new text");
    else {
        updateBookByTitle(Book, client, req.params.title, req.body.text, function(err){
            if(err == "Missing book") res.status(404).send("Book not found");
            else if (err) res.status(500).send("Server error");
            else res.status(200).send("Updated");
        });
    }
});

app.get('/api/list', function(req, res){
    listCache(client,'2',function(result,err){
        if(err) res.status(500).send(err);
        res.status(200).json({"Caches: ":result});
    });
});



app.listen(port);
console.log('Magic happens on port '+port);
