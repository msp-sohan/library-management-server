const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;
require("dotenv").config();

// middleware
app.use(
	cors({
		origin: ["http://localhost:5173", "https://the-library-msp.netlify.app"],
		credentials: true,
	}),
);

app.use(express.json());
app.use(cookieParser());

// Local Api = http://localhost:5000
// Live Api = https://b8a11-server-side-msp-sohan.vercel.app

// const uri = process.env.DB_URI;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fjonof5.mongodb.net/?retryWrites=true&w=majority`;

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
		return res.status(401).send({ message: "Unauthorized Access" });
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			return res.status(401).send({ message: "Unauthorized Access" });
		}

		req.decoded = decoded;
		next();
	});
};

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		// await client.connect();
		client.connect();

		const categoryCollection = client.db("LibraryDB").collection("categories");
		const allBooksCollection = client.db("LibraryDB").collection("allBooks");
		const borrowedBooksCollection = client.db("LibraryDB").collection("borrowedBook");

		//  Api For Categories
		app.get("/categories", async (req, res) => {
			const result = await categoryCollection.find().toArray();
			res.send(result);
		});

		// Api For All Books
		app.get("/allBooks", verifyToken, async (req, res) => {
			const email = req.query.email;
			const decodedEmail = req.decoded.email;

			if (decodedEmail !== email) {
				return res.status(403).send({ message: "Forbidden access" });
			}

			const filter = {};
			if (req.query.availability === "inLibrary") {
				filter.Quantity = { $gt: 0 };
			} else if (req.query.availability === "outOfLibrary") {
				filter.Quantity = 0;
			}

			if (req.query.categoryName) {
				filter.Category = req.query.categoryName;
			}

			const bookId = req.query.id;
			if (bookId) {
				filter._id = new ObjectId(bookId);
			}

			const cursor = allBooksCollection.find(filter);
			const result = await cursor.toArray();
			const total = await allBooksCollection.estimatedDocumentCount();
			res.send({ result, total });
		});

		// post new book to db
		app.post("/allBooks", verifyToken, async (req, res) => {
			const booksData = req.body;
			const email = booksData.userEmail;
			const decodedEmail = req.decoded.email;
			console.log(email, decodedEmail);

			if (decodedEmail !== email) {
				return res.status(403).send({ message: "Forbidden access" });
			}

			const result = await allBooksCollection.insertOne(booksData);
			res.send(result);
		});

		// get borrow book
		app.get("/borrowedBook", async (req, res) => {
			const email = req.query.email;
			const query = { userEmail: email };
			const result = await borrowedBooksCollection.find(query).toArray();
			res.send(result);
		});
		// Insert Borrowed Book
		app.post("/borrowBook", async (req, res) => {
			const bookData = req.body;
			try {
				const query = { id: bookData.id, userEmail: bookData.userEmail };
				const existingBorrowedBook = await borrowedBooksCollection.findOne(query);
				if (existingBorrowedBook) {
					return res.send({
						message: "You have already borrowed this book.",
					});
				}

				// Insert the borrowed book into the 'borrowedBook' collection
				const result = await borrowedBooksCollection.insertOne(bookData);

				if (result.insertedId) {
					// Decrease the book quantity in the 'allBooks' collection
					const filter = { _id: new ObjectId(bookData.id) };
					const updateQuantity = {
						$inc: {
							Quantity: -1,
						},
					};
					await allBooksCollection.updateOne(filter, updateQuantity);
					return res.send(result);
				} else {
					return res.send({
						message: "An error occurred while borrowing the book.",
					});
				}
			} catch (error) {
				console.error(error);
				return res.status(500).send("An error occurred while processing the request.");
			}
		});

		// Update Books
		app.put("/allBooks/:id", async (req, res) => {
			const id = req.params.id;
			console.log("update", id);
			const bookData = req.body;
			console.log(bookData);
			const filter = { _id: new ObjectId(id) };
			const options = { upsert: true };
			const updateBook = {
				$set: {
					BookName: bookData.BookName,
					AuthorName: bookData.AuthorName,
					Category: bookData.Category,
					Ratings: bookData.Ratings,
					BookImage: bookData.BookImage,
				},
			};
			const result = await allBooksCollection.updateOne(filter, updateBook, options);
			res.send(result);
		});

		// Delete Borrowed Book
		app.delete("/borrowedBook/:id", async (req, res) => {
			const id = req.params.id;
			console.log(id);
			const query = { _id: new ObjectId(id) };
			const result = await borrowedBooksCollection.deleteOne(query);
			if (result.deletedCount === 1) {
				const filter = { _id: new ObjectId(id) };
				const updateBook = {
					$inc: {
						Quantity: 1,
					},
				};
				// Increase the book quantity
				await allBooksCollection.updateOne(filter, updateBook);
				res.send(result);
				// return res.send({ message: 'Book Returned Successfully.' });
			} else {
				return res.status(404).send({ message: "Book not found in borrowed books." });
			}
		});

		// Genarate Token when Login
		app.post("/login", async (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "5h",
			});
			res.cookie("token", token, {
				httpOnly: false,
				secure: true,
				sameSite: "none",
			}).send({ success: true });
		});

		// Delete Token When Logout
		app.post("/logout", async (req, res) => {
			const user = req.body;
			res.clearCookie("token", { maxAge: 0 }).send({ success: true });
		});

		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log("Pinged your deployment. You successfully connected to MongoDB!");
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
