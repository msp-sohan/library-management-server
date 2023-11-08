const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require('jsonwebtoken');
const cookieParser = require("cookie-parser");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
app.use(express.json());
app.use(cookieParser());

// mongodb uri
const uri = process.env.DB_URI;
// const uri = 'mongodb://127.0.0.1:27017'

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

const verifyToken = (req, res, next) => {
	const token = req?.cookies?.token;
	if (!token) {
		return res.status(401).send({ message: 'Unauthorized Access' })
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			return res.status(401).send({ message: 'Unauthorized Access' })
		}

		req.user = decoded;
		next();
	})
}

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		// await client.connect();
		client.connect();

		const categoryCollection = client.db("LibraryDB").collection("categories");
		const allBooksCollection = client.db("LibraryDB").collection("allBooks");
		const borrowedBooksCollection = client.db("LibraryDB").collection("borrowedBook");

		// auth related route
		app.post('/login', async (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
			res.cookie('token', token, { httpOnly: false, secure: true, sameSite: 'none' })
				.send({ success: true });
		})

		app.post('/logout', async (req, res) => {
			const user = req.body;
			res.clearCookie('token', { maxAge: 0 }).send({ success: true })
		})

		//  library related route
		app.get("/categories", async (req, res) => {
			const result = await categoryCollection.find().toArray();
			res.send(result);
		});

		app.get("/allBooks", verifyToken, async (req, res) => {
			console.log('email', req.query.email);
			console.log("token owner info", req.user.email);

			// if (req.user.email !== req.query.email) {
			// 	return res.status(403).send({ message: 'Forbidden Access' })
			// }

			try {
				const categoryName = req.query.categoryName;
				const bookId = req.query.id;
				if (bookId) {
					const query = { _id: new ObjectId(bookId) };
					const result = await allBooksCollection.findOne(query);
					return res.send(result);
				}
				if (categoryName) {
					const query = { Category: categoryName };
					const result = await allBooksCollection.find(query).toArray();
					return res.send(result);
				}

				const allBooks = await allBooksCollection.find().toArray();
				return res.send(allBooks);
			} catch (error) {
				console.error(error);
				return res.status(500).send("An error occurred while fetching data.");
			}
		});

		// post new book to db
		app.post("/allBooks", async (req, res) => {
			const booksData = req.body
			const result = await allBooksCollection.insertOne(booksData)
			res.send(result)
		})
		// get borrow book
		app.get('/borrowedBook', async (req, res) => {
			const email = req.query.email
			const query = { userEmail: email }
			const result = await borrowedBooksCollection.find(query).toArray()
			res.send(result)
		})
		// Insert Borrowed Book
		app.post('/borrowBook', async (req, res) => {
			const bookData = req.body
			const { _id, userEmail } = bookData;

			// check the book is already borrowed
			const query = { _id: _id, userEmail: userEmail }
			const existingBorrowedBook = await borrowedBooksCollection.findOne(query);
			if (existingBorrowedBook) {
				return res.send({ message: 'You have already borrowed this book.' });
			}

			const result = await borrowedBooksCollection.insertOne(bookData)
			if (result.acknowledged === true) {
				const filter = { _id: new ObjectId(_id) };
				const updateBook = {
					$inc: {
						Quantity: -1
					},
				};
				// Decrease the book quantity
				await allBooksCollection.updateOne(filter, updateBook);
				return res.send(result);
			} else {
				return res.send({ message: 'An error occurred while borrowing the book.' });
			}
		})


		// Update Books
		app.put('/allBooks/:id', async (req, res) => {
			const id = req.params.id
			console.log('update', id)
			const bookData = req.body
			console.log(bookData)
			const filter = { _id: new ObjectId(id) }
			const options = { upsert: true }
			const updateBook = {
				$set: {
					BookName: bookData.BookName,
					AuthorName: bookData.AuthorName,
					Category: bookData.Category,
					Ratings: bookData.Ratings,
					BookImage: bookData.BookImage,
				}
			}
			const result = await allBooksCollection.updateOne(filter, updateBook, options)
			res.send(result)
		})


		// Delete Borrowed Book
		app.delete("/borrowedBook/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: id }
			const result = await borrowedBooksCollection.deleteOne(query)
			if (result.deletedCount === 1) {
				const filter = { _id: new ObjectId(id) };
				const updateBook = {
					$inc: {
						Quantity: 1
					},
				};
				// Increase the book quantity
				await allBooksCollection.updateOne(filter, updateBook);
				res.send(result)
				// return res.send({ message: 'Book Returned Successfully.' });
			} else {
				return res.status(404).send({ message: 'Book not found in borrowed books.' });
			}
		})



		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!",
		);
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("Library Management Server is Running");
});

app.listen(port, () => {
	console.log(`Library Management Server is Running on port: ${port}`);
});
