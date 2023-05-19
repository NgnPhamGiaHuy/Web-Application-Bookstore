const geoip = require('geoip-lite');
const Book = require('../models/Book');
const Genre = require('../models/Genre');
const Author = require('../models/Author');
const Cart = require('../models/Cart');
const Review = require('../models/Review');
const CartItem = require('../models/CartItem');
const BookGenre = require('../models/BookGenre');
const BookAuthor = require('../models/BookAuthor');
const generateDummyData = require('../../config/database/dataGenerator');

class HomePageController {
    static getCityAndZipCode(req) {
        let city = '';
        let zipCode = '';

        if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
            city = 'Vung Tau';
            zipCode = '780000';
        } else {
            const ipAddress = req.ip;
            const geo = geoip.lookup(ipAddress);
            city = geo?.city || '';
            zipCode = geo?.zip || '';
        }

        return {city, zipCode};
    }

    static async calculateTotalQuantity(cartItems) {
        let totalQuantity = 0;

        for (const cartItem of cartItems) {
            totalQuantity += cartItem.quantity;
        }

        return totalQuantity;
    }

    async index(req, res, next) {
        try {
            const books = await Book.find({}, 'book_title cover_image price sale_price inventory_count sale_count')
                .lean()
                .exec();
            const bookIds = books.map((book) => book._id);
            const customerId = req.session.customerId;
            const {city, zipCode} = HomePageController.getCityAndZipCode(req);

            const countPromises = [Book.countDocuments().lean().exec(), Author.countDocuments().lean().exec(), Genre.countDocuments().lean().exec()];
            const [totalBooks, totalAuthors] = await Promise.all(countPromises);
            const totalGenres = await Genre.find().distinct('genre_name');

            const bookGenrePromise = BookGenre.find({book: {$in: bookIds}})
                .populate('genre', 'genre_name')
                .lean()
                .exec();

            const bookAuthorPromise = BookAuthor.find({book: {$in: bookIds}})
                .populate({path: 'author', model: 'Author', select: 'author_name'})
                .lean()
                .exec();

            const reviewPromise = Review.aggregate([{$match: {book: {$in: bookIds}}}, {
                $group: {
                    _id: '$book', averageRating: {$avg: '$rating'},
                },
            },]).exec();

            const [bookGenres, bookAuthors, bookRatings] = await Promise.all([bookGenrePromise, bookAuthorPromise, reviewPromise]);

            const bookData = books.map((book) => {
                const genres = bookGenres
                    .filter((bg) => bg.book.equals(book._id))
                    .map((bg) => bg.genre.genre_name);

                const authors = bookAuthors
                    .filter((ba) => ba.book.equals(book._id))
                    .map((ba) => ba.author.author_name);

                const bookRating = bookRatings.find((rating) => rating._id.equals(book._id));
                const rating = bookRating ? parseFloat(bookRating.averageRating.toFixed(2)) : 0;
                const ratingWidth = rating * 20;

                return {
                    genres,
                    authors,
                    rating,
                    ratingWidth,
                    reviews: [],
                    _id: book._id,
                    price: book.price,
                    sale_price: book.sale_price,
                    book_title: book.book_title,
                    cover_image: book.cover_image,
                    sale_count: book.sale_count,
                    publication_date: book.publication_date,
                    inventory_count: book.inventory_count,
                };
            });

            const sortedBooks = [...bookData].sort((a, b) => b.sale_count - a.sale_count);
            const bestSaleBooks = sortedBooks.slice(0, 5);
            const currentWeekBestSaleBooks = sortedBooks
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 6);

            const recentBooks = [...bookData].sort((a, b) => a.createdAt - b.createdAt);

            const trendBooks = [...bookData].sort((a, b) => {
                if (a.inventory_count !== b.inventory_count) {
                    return a.inventory_count - b.inventory_count;
                }
                if (a.rating !== b.rating) {
                    return b.rating - a.rating;
                }
                return a.price - b.price;
            });

            const onSaleBooks = bookData.filter((book) => book.sale_price);

            const topRatedBooks = [...bookData].sort((a, b) => {
                if (a.rating > b.rating) {
                    return -1;
                } else if (a.rating < b.rating) {
                    return 1;
                } else {
                    return b.reviews.length - a.reviews.length;
                }
            });

            const randomSaleBooks = sortedBooks.slice(0, 3);

            let cart = null;
            let cartItems = [];
            let totalQuantity = 0;

            if (customerId) {
                cart = await Cart.findOne({customer: customerId})
                    .populate('customer')
                    .lean()
                    .exec();

                if (cart) {
                    cartItems = await CartItem.find({cart: cart._id})
                        .populate('book')
                        .lean()
                        .exec();
                    totalQuantity = await HomePageController.calculateTotalQuantity(cartItems);
                }
            }

            return res.render('index', {
                city,
                zipCode,
                totalBooks,
                totalGenres,
                totalAuthors,
                trendBooks,
                sortedBooks,
                onSaleBooks,
                recentBooks,
                topRatedBooks,
                totalQuantity,
                randomSaleBooks,
                booksOfAll: bestSaleBooks,
                currentWeekBestSaleBooks,
                customerData: req.session.customer,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({error: 'Internal server error'});
        }
    }
}

module.exports = new HomePageController();