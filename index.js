const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
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

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		// await client.connect();
		client.connect();

		const categoryCollection = client.db("LibraryDB").collection("categories");
		const allBooksCollection = client.db("LibraryDB").collection("allBooks");
		const borrowedBooksCollection = client.db("LibraryDB").collection("borrowedBook");

		app.get("/categories", async (req, res) => {
			const result = await categoryCollection.find().toArray();
			res.send(result);
		});

		app.get("/allBooks", async (req, res) => {
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
				// If no category name is provided and no bookId is provided, fetch all data
				const allBooks = await allBooksCollection.find().toArray();
				return res.send(allBooks);
			} catch (error) {
				console.error(error);
				return res.status(500).send("An error occurred while fetching data.");
			}
		});
		app.post("/allBooks", async (req, res) => {
			const booksData = req.body
			const result = await allBooksCollection.insertOne(booksData)
			res.send(result)
		})

		app.get('/borrowedBook', async (req, res) => {
			const email = req.query.email
			const query = { userEmail: email }
			const result = await borrowedBooksCollection.find(query).toArray()
			res.send(result)
		})
		// Inset Borrowed Book
		app.post('/borrowBook', async (req, res) => {
			const bookData = req.body
			const { _id, userEmail } = bookData;
			// check the book is already borrowed
			const query = { _id: _id, userEmail: userEmail }
			const existingBorrowedBook = await borrowedBooksCollection.findOne(query);
			if (existingBorrowedBook) {
				return res.send({ message: 'You have already borrowed this book.' });
			}
			// Find the book and check its quantity
			// const querybook = { _id: new ObjectId(_id) }
			// const book = await allBooksCollection.findOne(querybook);
			// if (!book || book.Quantity <= 0) {
			// 	return res.send({ message: 'This book is not available for borrowing.' });
			// }

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

				// return res.send({ message: 'Book Decreased successfully.' });
				return res.send(result);
			} else {
				return res.send({ message: 'An error occurred while borrowing the book.' });
			}
		})


		// app.post('/borrowedBook', async (req, res) => {
		// 	const { _id, userEmail } = req.body;
		// 	console.log(_id, userEmail)

		// 	try {
		// 		// Check if the user has already borrowed the book
		// 		const query = { _id: _id, userEmail: userEmail }
		// 		const existingBorrowedBook = await borrowedBooksCollection.findOne(query);

		// 		if (existingBorrowedBook) {
		// 			console.log('error match')
		// 			return res.status(400).json({ message: 'You have already borrowed this book.' });
		// 		}

		// 		// Find the book and check its quantity
		// 		const book = await allBooksCollection.findOne({ _id });
		// 		if (!book || book.Quantity <= 0) {
		// 			return res.status(400).json({ message: 'This book is not available for borrowing.' });
		// 		}

		// 		// Insert a new borrowed book record
		// 		const borrowedBookData = req.body

		// 		const result = await borrowedBooksCollection.insertOne(borrowedBookData);

		// 		if (result.insertedCount === 1) {
		// 			// Decrease the book's quantity
		// 			await allBooksCollection.updateOne(
		// 				{ _id },
		// 				{ $inc: { Quantity: -1 } }
		// 			);
		// 			return res.json({ message: 'Book borrowed successfully.' });
		// 		} else {
		// 			return res.status(500).json({ message: 'An error occurred while borrowing the book.' });
		// 		}
		// 	} catch (error) {
		// 		console.error(error);
		// 		return res.status(500).json({ message: 'An error occurred while borrowing the book.' });
		// 	}
		// });


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
