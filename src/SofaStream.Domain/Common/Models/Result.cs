namespace SofaStream.Domain.Common.Models;

/// <summary>
/// Represents the result of an operation, indicating success or failure along with an error state.
/// </summary>
public class Result
{
    /// <summary>
    /// Gets a value indicating whether the operation succeeded.
    /// </summary>
    public bool IsSuccess { get; }

    /// <summary>
    /// Gets a value indicating whether the operation failed.
    /// </summary>
    public bool IsFailure => !IsSuccess;

    /// <summary>
    /// Gets the error associated with the failed operation. Returns <see cref="Error.None"/> on success.
    /// </summary>
    public Error Error { get; }

    /// <summary>
    /// Initializes a new instance of the <see cref="Result"/> class.
    /// </summary>
    /// <param name="isSuccess">True if the operation was successful; otherwise, false.</param>
    /// <param name="error">The error detail representing the failure.</param>
    /// <exception cref="InvalidOperationException">Thrown if the success state does not match the error state.</exception>
    protected Result(bool isSuccess, Error error)
    {
        if (isSuccess && error != Error.None)
            throw new InvalidOperationException();
        if (!isSuccess && error == Error.None)
            throw new InvalidOperationException();
        
        IsSuccess = isSuccess;
        Error = error;
    }
    
    /// <summary>
    /// Creates a successful operation result.
    /// </summary>
    /// <returns>A successful <see cref="Result"/> instance.</returns>
    public static Result Success() => new Result(true, Error.None);

    /// <summary>
    /// Creates a failed operation result containing the specified error.
    /// </summary>
    /// <param name="error">The error associated with the failure.</param>
    /// <returns>A failed <see cref="Result"/> instance.</returns>
    public static Result Failure(Error error) => new Result(false, error);
}

/// <summary>
/// Represents the result of an operation that returns a value on success, along with success/failure status.
/// </summary>
/// <typeparam name="T">The type of the successful result value.</typeparam>
public class Result<T> : Result
{
    private readonly T? _value;
    
    /// <summary>
    /// Gets the value returned by the successful operation.
    /// </summary>
    /// <exception cref="InvalidOperationException">Thrown if attempting to access the value of a failed result.</exception>
    public T Value => IsSuccess 
        ? _value! 
        : throw new InvalidOperationException("It's forbidden get a value from a failed result.");
    
    /// <summary>
    /// Initializes a new instance of the <see cref="Result{T}"/> class.
    /// </summary>
    /// <param name="value">The returned value.</param>
    /// <param name="isSuccess">True if the operation was successful; otherwise, false.</param>
    /// <param name="error">The error detail representing the failure.</param>
    protected internal Result(T? value, bool isSuccess, Error error) 
        : base(isSuccess, error)
    {
        _value = value;
    }
    
    /// <summary>
    /// Creates a successful operation result containing the specified value.
    /// </summary>
    /// <param name="value">The successful result value.</param>
    /// <returns>A successful <see cref="Result{T}"/> instance.</returns>
    public static Result<T> Success(T value) => new(value, true, Error.None);

    /// <summary>
    /// Creates a failed operation result containing the specified error.
    /// </summary>
    /// <param name="error">The error associated with the failure.</param>
    /// <returns>A failed <see cref="Result{T}"/> instance.</returns>
    public static new Result<T> Failure(Error error) => new(default, false, error);
}